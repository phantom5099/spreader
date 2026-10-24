// Package identity 身份模块：对外只暴露 New 与 App.Register，实现全部在 internal/。
// 进程入口不能直接 import internal/，这里是唯一合法的装配面。
package identity

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"net/http"

	khttp "github.com/go-kratos/kratos/v3/transport/http"

	"github.com/phantom5099/spreader/app/identity/internal/dev/thirdparty_mock"
	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/otp"
	"github.com/phantom5099/spreader/app/identity/internal/platform/captcha"
	"github.com/phantom5099/spreader/app/identity/internal/platform/eventlog"
	"github.com/phantom5099/spreader/app/identity/internal/platform/mail"
	"github.com/phantom5099/spreader/app/identity/internal/platform/postgres"
	"github.com/phantom5099/spreader/app/identity/internal/platform/redis"
	"github.com/phantom5099/spreader/app/identity/internal/platform/sms"
	"github.com/phantom5099/spreader/app/identity/internal/session"
	"github.com/phantom5099/spreader/app/platform/config"
	"github.com/phantom5099/spreader/app/platform/metrics"
)

// Deps 由进程入口构造后注入：连接池与配置的生命周期归入口所有，模块不自己建。
type Deps struct {
	Config     *config.Config
	Infra      *Infra
	Log        *slog.Logger
	Production bool
}

// App 模块装配结果：路由注册与后台依赖都由它持有。
type App struct {
	log     *slog.Logger
	handler *login.Handler
	mock    *thirdparty_mock.Provider
}

// New 装配身份模块。返回错误表示配置非法，调用方应直接退出而不是带病运行。
func New(d Deps) (*App, error) {
	if d.Config == nil || d.Infra == nil || d.Log == nil {
		return nil, errors.New("identity: Config, Infra and Log are required")
	}
	cfg, log := d.Config, d.Log
	db, cache := d.Infra.db, d.Infra.cache

	jwtSecret, err := config.RequireEnv(cfg.JWT.SecretEnv)
	if err != nil {
		return nil, err
	}
	publisher := eventlog.NewPublisher(log, auditWriterAdapter{p: db})
	issuer := session.NewIssuer(db, cache, db, publisher, session.Config{
		ATSecret: jwtSecret,
		ATTTL:    time.Duration(cfg.JWT.ATTTLSec) * time.Second,
		RTTTL:    time.Duration(cfg.JWT.RTTTLSec) * time.Second,
	}, log)

	otpSvc := otp.NewService(redis.NewOTPStore(cache), buildChannelRouter(cfg, log), otp.Config{
		TTLSeconds:       cfg.OTP.TTLSeconds,
		CodeLength:       cfg.OTP.CodeLength,
		CooldownSeconds:  cfg.OTP.CooldownSeconds,
		DailyLimit:       cfg.OTP.DailyLimit,
		PerIPPerHour:     cfg.OTP.PerIPPerHour,
		PerDevicePerHour: cfg.OTP.PerDevicePerHour,
		GlobalPerMinute:  cfg.OTP.GlobalPerMinute,
		Pepper:           config.Env(cfg.OTP.PepperEnv),
		SceneIsolation:   cfg.OTP.SceneIsolation,
	}, log)

	providers, mockProvider := buildProviders(cfg, cache, d.Production, log)

	policy := captcha.NewPolicy( // 计数读失败 fail-open + 告警，见 Policy.Evaluate
		captcha.PolicyCfg{
			OTPSendPerIPPerHour:     cfg.Captcha.Policy.OTPSendPerIPPerHour,
			OTPSendPerDevicePerHour: cfg.Captcha.Policy.OTPSendPerDevicePerHour,
			LoginFailPerAccount:     cfg.Captcha.Policy.LoginFailPerAccount,
		}, cache, log)
	verifier, err := newVerifier(cfg, cache)
	if err != nil {
		return nil, err
	}

	strategies := login.NewStrategies(&login.StrategyDeps{
		Users:        db,
		Credentials:  db,
		ThirdParties: db,
		OTP:          otpSvc,
		Pepper:       login.Pepper(config.Env(cfg.Password.PepperEnv)),
		PwdCfg: login.PasswordGuardConfig{
			MaxFails:      cfg.Password.MaxFails,
			FailWindowSec: cfg.Password.FailWindowSec,
			LockSec:       cfg.Password.LockSec,
		},
		PwdGuard:  cache,
		Providers: providers,
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
	return &App{log: log, handler: login.NewHandler(svc, db, issuer, verifier), mock: mockProvider}, nil
}

// Register 把模块的 HTTP 路由挂到 server 上；路径即对外契约。
func (a *App) Register(hs *khttp.Server) {
	r := hs.Route("/v1")
	a.route(r, http.MethodPost, "/auth/otp:send", a.handler.SendOtp)
	a.route(r, http.MethodPost, "/auth/login", a.handler.Login)
	a.route(r, http.MethodPost, "/auth/captcha:issue", a.handler.IssueCaptcha)
	a.route(r, http.MethodPost, "/auth/token:refresh", a.handler.RefreshToken)
	a.route(r, http.MethodDelete, "/auth/session", a.handler.Logout)
	a.route(r, http.MethodGet, "/me", a.handler.GetMe)
	a.route(r, http.MethodGet, "/auth/thirdparty/authorize", a.handler.ThirdPartyAuthorize)
	a.route(r, http.MethodGet, "/auth/thirdparty/callback", a.handler.ThirdPartyCallback)
	if a.mock != nil {
		// mock 授权页与业务同端口（public_base_url 即服务地址，回调地址天然一致）
		thirdparty_mock.RegisterRoutes(hs.Route("/mock/oauth"), a.mock, a.log)
	}
}

// route 注册一条路由并挂上 RED 指标；operation 用常量，避免路径扫描撑爆 label。
func (a *App) route(r *khttp.Router, method, path string, h khttp.HandlerFunc) {
	r.Handle(method, path, h, metrics.Filter(method+" /v1"+path))
}

// newVerifier 按配置选人机验证实现；未知值 fail-fast，静默落 None 等于配置说开、实际关。
func newVerifier(cfg *config.Config, cache *redis.Client) (login.HumanVerifier, error) {
	switch cfg.Captcha.Verifier {
	case "", "none":
		return captcha.None{}, nil
	case "selfhosted":
		return captcha.NewSelfhosted(cache, cfg.Captcha.ChallengeTTLSec, cfg.Captcha.IssuePerIPPerHour), nil
	default:
		return nil, fmt.Errorf("unknown captcha verifier: %s", cfg.Captcha.Verifier)
	}
}

// providerRegistry login.ThirdPartyRegistry 的具体实现（装配层拥有）。
type providerRegistry map[string]login.ThirdPartyProvider

func (m providerRegistry) Get(p string) (login.ThirdPartyProvider, bool) {
	v, ok := m[p]
	return v, ok
}

// auditWriterAdapter eventlog.AuditRow → postgres.LoginAuditRow 的投影转换。
type auditWriterAdapter struct{ p *postgres.Pool }

func (a auditWriterAdapter) WriteLoginAudit(ctx context.Context, rows []eventlog.AuditRow) error {
	out := make([]postgres.LoginAuditRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, postgres.LoginAuditRow{
			UserID:             r.UserID,
			LoginType:          r.LoginType,
			IdentifierMasked:   r.IdentifierMasked,
			Result:             r.Result,
			Reason:             r.Reason,
			IP:                 r.IP,
			DeviceID:           r.DeviceID,
			CaptchaChallengeID: r.CaptchaChallengeID,
			CaptchaKind:        r.CaptchaKind,
			CaptchaResult:      r.CaptchaResult,
		})
	}
	return a.p.WriteLoginAudit(ctx, out)
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

// buildProviders 构建第三方 provider 注册表——与 buildChannelRouter 同构：
// 实现归代码，启用归配置。mock 双闸 = 非 production 且 allow_insecure_providers。
func buildProviders(cfg *config.Config, cache *redis.Client, production bool, log *slog.Logger) (providerRegistry, *thirdparty_mock.Provider) {
	providers := providerRegistry{}
	var mockProvider *thirdparty_mock.Provider
	if !production && cfg.ThirdParty.AllowInsecureProviders {
		mock := thirdparty_mock.New(thirdparty_mock.Config{
			AppID:          cfg.ThirdParty.Mock.AppID,
			ExternalIDPool: cfg.ThirdParty.Mock.ExternalIDPool,
			PublicBaseURL:  cfg.ThirdParty.Mock.PublicBaseURL,
			CallbackURL:    cfg.ThirdParty.Mock.PublicBaseURL + "/v1/auth/thirdparty/callback",
		}, redis.NewThirdPartyStore(cache))
		providers[mock.Provider()] = mock
		mockProvider = mock
		log.Info("mock thirdparty provider enabled (insecure, dev only)")
	} else if cfg.ThirdParty.AllowInsecureProviders {
		// 想开 mock 但环境是 production：双闸拦下，启动继续（仅无 mock 可用）。
		log.Warn("mock provider blocked by double gate (APP_ENV=production)")
	}
	return providers, mockProvider
}
