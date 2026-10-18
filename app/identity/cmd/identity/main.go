// identity 服务组装点：唯一同时 import 领域层与平台层的位置（手工构造注入）。
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	kratos "github.com/go-kratos/kratos/v3"
	kerrors "github.com/go-kratos/kratos/v3/errors"
	"github.com/go-kratos/kratos/v3/transport/grpc"
	khttp "github.com/go-kratos/kratos/v3/transport/http"

	v1 "github.com/phantom5099/spreader/api/identity/v1"
	"github.com/phantom5099/spreader/app/identity/internal/dev/thirdparty_mock"
	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/otp"
	"github.com/phantom5099/spreader/app/identity/internal/platform/captcha"
	"github.com/phantom5099/spreader/app/identity/internal/platform/config"
	"github.com/phantom5099/spreader/app/identity/internal/platform/kafka"
	"github.com/phantom5099/spreader/app/identity/internal/platform/mail"
	"github.com/phantom5099/spreader/app/identity/internal/platform/postgres"
	"github.com/phantom5099/spreader/app/identity/internal/platform/redis"
	"github.com/phantom5099/spreader/app/identity/internal/platform/sms"
	"github.com/phantom5099/spreader/app/identity/internal/session"
)

// providerRegistry login.ThirdPartyRegistry 的具体实现（cmd/ 拥有）。
type providerRegistry map[string]login.ThirdPartyProvider

func (m providerRegistry) Get(p string) (login.ThirdPartyProvider, bool) {
	v, ok := m[p]
	return v, ok
}

// auditWriterAdapter kafka.AuditRow → postgres.LoginAuditRow 的投影转换。
type auditWriterAdapter struct{ p *postgres.Pool }

func (a auditWriterAdapter) WriteLoginAudit(ctx context.Context, rows []kafka.AuditRow) error {
	out := make([]postgres.LoginAuditRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, postgres.LoginAuditRow{
			UserID:           r.UserID,
			LoginType:        r.LoginType,
			IdentifierMasked: r.IdentifierMasked,
			Result:           r.Result,
			Reason:           r.Reason,
			IP:               r.IP,
			DeviceID:         r.DeviceID,
		})
	}
	return a.p.WriteLoginAudit(ctx, out)
}

func main() {
	os.Exit(run())
}

// run 装配并运行服务，返回进程退出码（defer 在此全部收敛）。
func run() int {
	confPath := flag.String("conf", "configs/identity.yaml", "config file path")
	httpAddr := flag.String("http", "", "http listen address (overrides config)")
	grpcAddr := flag.String("grpc", "", "grpc listen address (overrides config)")
	flag.Parse()
	if v := os.Getenv("IDENTITY_CONF"); v != "" {
		*confPath = v
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

	cfg, err := config.Load(*confPath)
	if err != nil {
		log.Error("load config", "err", err)
		return 1
	}
	env := strings.ToLower(config.Env("APP_ENV"))
	production := env == "production"
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// ── 基础设施 ──────────────────────────────────────────────
	dsn, err := config.RequireEnv(cfg.Database.DSNEnv)
	if err != nil {
		log.Error("db dsn", "err", err)
		return 1
	}
	db, err := postgres.New(ctx, dsn)
	if err != nil {
		log.Error("postgres", "err", err)
		return 1
	}
	defer db.Close()

	cache, err := redis.New(ctx, &redis.Options{
		Mode:       cfg.Redis.Mode,
		Addrs:      cfg.Redis.Addrs,
		MasterName: cfg.Redis.MasterName,
		Password:   cfg.Redis.Password,
		DB:         cfg.Redis.DB,
	})
	if err != nil {
		log.Error("redis", "err", err)
		return 1
	}
	defer func() { _ = cache.Close() }()

	publisher := kafka.NewPublisher(cfg.Kafka.Brokers, log)
	defer func() { _ = publisher.Close() }()
	go kafka.NewAuditConsumer(cfg.Kafka.Brokers, "identity-audit", auditWriterAdapter{db}, log).Run(ctx)
	go func() { // 过期数据清理：每 6 小时一轮
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if cerr := db.CleanupExpired(ctx); cerr != nil {
					log.Error("cleanup expired", "err", err)
				}
			}
		}
	}()

	// ── 会话与令牌 ────────────────────────────────────────────
	jwtSecret, err := config.RequireEnv(cfg.JWT.SecretEnv)
	if err != nil {
		log.Error("jwt secret", "err", err)
		return 1
	}
	issuer := session.NewIssuer(db, cache, db, publisher, session.Config{
		ATSecret: jwtSecret,
		ATTTL:    time.Duration(cfg.JWT.ATTTLSec) * time.Second,
		RTTTL:    time.Duration(cfg.JWT.RTTTLSec) * time.Second,
	}, log)

	// ── 验证码域 ──────────────────────────────────────────────
	otpPepper := config.Env(cfg.OTP.PepperEnv)
	otpSvc := otp.NewService(redis.NewOTPStore(cache), buildChannelRouter(cfg, log), otp.Config{
		TTLSeconds:       cfg.OTP.TTLSeconds,
		CodeLength:       cfg.OTP.CodeLength,
		CooldownSeconds:  cfg.OTP.CooldownSeconds,
		DailyLimit:       cfg.OTP.DailyLimit,
		PerIPPerHour:     cfg.OTP.PerIPPerHour,
		PerDevicePerHour: cfg.OTP.PerDevicePerHour,
		GlobalPerMinute:  cfg.OTP.GlobalPerMinute,
		Pepper:           otpPepper,
		SceneIsolation:   cfg.OTP.SceneIsolation,
	}, log)

	// ── 第三方 provider 注册表──
	providers := buildProviders(cfg, cache, production, log)

	// ── 人机验证：policy 决定何时验，verifier 决定怎么验 ────────
	policy := captcha.NewPolicy( // 计数读失败 fail-open + 告警，见 Policy.Evaluate
		captcha.PolicyCfg{
			OTPSendPerIPPerHour:     cfg.Captcha.Policy.OTPSendPerIPPerHour,
			OTPSendPerDevicePerHour: cfg.Captcha.Policy.OTPSendPerDevicePerHour,
			LoginFailPerAccount:     cfg.Captcha.Policy.LoginFailPerAccount,
		}, cache, log)
	var verifier login.HumanVerifier
	switch cfg.Captcha.Verifier {
	case "", "none":
		verifier = captcha.None{}
	case "selfhosted":
		verifier = captcha.NewSelfhosted(cache, cfg.Captcha.ChallengeTTLSec, cfg.Captcha.IssuePerIPPerHour)
	default:
		// 未知值 fail-fast：静默落 None 等于配置说开、实际关。
		log.Error("unknown captcha verifier", "verifier", cfg.Captcha.Verifier)
		return 1
	}

	// ── 登录域 ────────────────────────────────────────────────
	argonPepper := login.Pepper(config.Env(cfg.Password.PepperEnv))
	strategies := login.NewStrategies(&login.StrategyDeps{
		Users:        db,
		Credentials:  db,
		ThirdParties: db,
		OTP:          otpSvc,
		Pepper:       argonPepper,
		PwdCfg: login.PasswordGuardConfig{
			MaxFails:      cfg.Password.MaxFails,
			FailWindowSec: cfg.Password.FailWindowSec,
			LockSec:       cfg.Password.LockSec,
		},
		PwdGuard: cache,
	})
	for _, dt := range cfg.Login.DisabledTypes {
		delete(strategies, dt) // 被配置停用的登录方式：Login 返回 UNSUPPORTED_LOGIN_TYPE
	}
	svc := login.NewService(login.Deps{
		Strategies:   strategies,
		Users:        db,
		Sessions:     issuer,
		Events:       publisher,
		OTP:          otpSvc,
		Policy:       policy,
		Verifier:     verifier,
		FailGuard:    redis.NewCaptchaFailStore(cache),
		ThirdParties: redis.NewThirdPartyStore(cache),
		Log:          log,
		Providers:    providers,
		Cfg: login.Config{
			StateTTLSeconds: 600,
			CodeTTLSeconds:  120,
			PwdCfg:          login.PasswordGuardConfig{MaxFails: cfg.Password.MaxFails},
		},
	})
	handler := login.NewHandler(svc, db, issuer, verifier)

	// ── HTTP + gRPC 双栈 ──────────────────────────────────────
	// 解析顺序：flag > 配置文件 > 内置兜底。
	httpListen, grpcListen := *httpAddr, *grpcAddr
	if httpListen == "" {
		httpListen = firstNonEmptyStr(cfg.Server.HTTPAddr, "127.0.0.1:8000")
	}
	if grpcListen == "" {
		grpcListen = firstNonEmptyStr(cfg.Server.GRPCAddr, "127.0.0.1:9000")
	}
	hs := khttp.NewServer(
		khttp.Address(httpListen),
		khttp.Middleware(login.AuthMiddleware(issuer)),
		khttp.ErrorEncoder(problemEncoder()),
	)
	v1.RegisterIdentityServiceHTTPServer(hs, handler)
	hs.Route("/v1/identity").GET("/ping", func(ctx khttp.Context) error {
		return ctx.JSON(http.StatusOK, map[string]string{"service": "identity"})
	})
	gs := grpc.NewServer(
		grpc.Address(grpcListen),
		grpc.Middleware(login.AuthMiddleware(issuer)),
	)
	v1.RegisterIdentityServiceServer(gs, handler)

	app := kratos.New(
		kratos.Name("identity"),
		kratos.Context(ctx),
		kratos.Server(hs, gs),
	)
	if err := app.Run(); err != nil {
		log.Error("app run", "err", err)
		return 1
	}
	return 0
}

// buildChannelRouter 按 configs 的 channels 表构建主备通道链。
// 通道实现在代码，选哪条在配置——切通道是运维动作，不发版。
func buildChannelRouter(cfg *config.Config, log *slog.Logger) *otp.Router {
	registry := map[string]otp.Sender{"console": &mail.Console{Log: log}}
	if cfg.Mail.SMTP.Host != "" {
		username := config.Env(cfg.Mail.SMTP.UsernameEnv)
		password := config.Env(cfg.Mail.SMTP.PasswordEnv)
		if username == "" || password == "" {
			log.Warn("smtp channel skipped: credentials empty")
		} else {
			smtpSender := mail.NewSMTP(mail.SMTPConfig{
				Host:     cfg.Mail.SMTP.Host,
				Port:     cfg.Mail.SMTP.Port,
				Username: username,
				Password: password,
				From:     cfg.Mail.SMTP.From,
			})
			registry["smtp"] = smtpSender
			if cfg.Mail.Mail139.Domain != "" {
				registry["mail139_bridge"] = mail.NewMail139(mail.SMTPConfig{
					Host:     cfg.Mail.SMTP.Host,
					Port:     cfg.Mail.SMTP.Port,
					Username: username,
					Password: password,
					From:     cfg.Mail.SMTP.From,
				}, cfg.Mail.Mail139.Domain)
			}
		}
	}
	if cs := cfg.SMS.CloudSMS; cs.Provider != "" {
		s, err := sms.NewCloudSMS(cs.Provider,
			config.Env(cs.SecretIDEnv), config.Env(cs.SecretKeyEnv),
			config.Env(cs.SdkAppIDEnv), cs.SignName, config.Env(cs.TemplateIDEnv))
		if err != nil {
			log.Warn("cloud_sms channel skipped", "err", err)
		} else {
			registry["cloud_sms"] = s
		}
	}

	chains := map[string][]otp.Sender{}
	for routeKey, route := range cfg.OTP.Channels {
		channel := routeKey // login.phone → phone（取点号后段）
		if i := strings.LastIndex(routeKey, "."); i >= 0 {
			channel = routeKey[i+1:]
		}
		for _, name := range []string{route.Primary, route.Fallback} {
			if name == "" {
				continue
			}
			s, ok := registry[name]
			if !ok {
				log.Warn("channel sender not built, skipped", "route", routeKey, "sender", name)
				continue
			}
			chains[channel] = append(chains[channel], s)
		}
	}
	return otp.NewRouter(chains)
}

// startMockServer 启动 mock 第三方授权页的独立 dev HTTP 端点。
func startMockServer(p *thirdparty_mock.Provider, base string, log *slog.Logger) {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		log.Error("mock public_base_url invalid", "base", base)
		return
	}
	mux := http.NewServeMux()
	thirdparty_mock.RegisterRoutes(mux, p, log)
	srv := &http.Server{Addr: u.Host, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Info("mock oauth endpoints listening", "addr", u.Host)
	if err := srv.ListenAndServe(); err != nil {
		log.Error("mock server exit", "err", err)
	}
}

// buildProviders 构建第三方 provider 注册表——与 buildChannelRouter 同构：
// 实现归代码（platform/thirdparty 的各实现 + dev/thirdparty_mock），启用归配置。
//
// mock（wechat_mock）：开发期测试替身，双闸 = APP_ENV != production 且 allow_insecure_providers，
// 生产启动时永不注册；真实平台接入时：实现 ThirdPartyIdentityProvider + 在标记处追加注册段，
// 登录请求逐次携带 provider（策略模式的请求时分发），无需改此处结构。
func buildProviders(cfg *config.Config, cache *redis.Client, production bool, log *slog.Logger) providerRegistry {
	providers := providerRegistry{}

	// ── mock（wechat_mock）：双闸 ──
	if !production && cfg.ThirdParty.AllowInsecureProviders {
		mock := thirdparty_mock.New(thirdparty_mock.Config{
			AppID:          cfg.ThirdParty.Mock.AppID,
			ExternalIDPool: cfg.ThirdParty.Mock.ExternalIDPool,
			PublicBaseURL:  cfg.ThirdParty.Mock.PublicBaseURL,
			CallbackURL:    cfg.ThirdParty.Mock.PublicBaseURL + "/v1/auth/thirdparty/callback",
		}, redis.NewThirdPartyStore(cache))
		providers[mock.Provider()] = mock
		go startMockServer(mock, cfg.ThirdParty.Mock.PublicBaseURL, log)
		log.Info("mock thirdparty provider enabled (insecure, dev only)")
	} else if cfg.ThirdParty.AllowInsecureProviders {
		// 想开 mock 但环境是 production：双闸拦下，启动继续（仅无 mock 可用）。
		log.Warn("mock provider blocked by double gate (APP_ENV=production)")
	}
	return providers
}

// problemEncoder 按 RFC 9457 输出 application/problem+json：
// 业务码（proto ErrorReason 值名，IAM.*）放扩展成员 code；retryable/challenge 一并作为扩展成员。
func problemEncoder() khttp.EncodeErrorFunc {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		se := kerrors.FromError(err)
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(int(se.Code))
		body := map[string]any{
			"type":   "about:blank",
			"title":  http.StatusText(int(se.Code)),
			"status": se.Code,
			"code":   se.Reason,
			"detail": se.Message,
		}
		for k, v := range se.Metadata {
			if k == "challenge" {
				body[k] = json.RawMessage(v) // 挑战对象原样嵌入
				continue
			}
			body[k] = v
		}
		_ = json.NewEncoder(w).Encode(body)
	}
}

// firstNonEmptyStr 返回第一个非空字符串（配置兜底链）。
func firstNonEmptyStr(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}
