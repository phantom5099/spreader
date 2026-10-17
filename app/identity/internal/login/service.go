package login

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
)

// OTPVerifier 登录域对验证码校验的窄接口（otp 域实现，cmd/ 注入）。
type OTPVerifier interface {
	// Verify 校验并消费验证码；失败返回 *Error（EOtpInvalid）。
	Verify(ctx context.Context, channel, dest, code string) error
}

// SessionIssuer 会话与令牌的窄接口（session 域实现，cmd/ 注入）。
type SessionIssuer interface {
	// Issue 签发 AT(JWT) + RT(不透明随机串)。ver = 用户当前 token_version，写入 AT claims。
	Issue(ctx context.Context, userID string, ver int64, deviceID, platform string) (access, refresh string, expiresIn int64, err error)
	// Refresh RT 族轮换 + 重放检测：重放时撤销整个 family 并返回 ERefreshTokenReused。
	Refresh(ctx context.Context, rawRefresh, deviceID string) (access, refresh string, expiresIn int64, userID string, err error)
	// Revoke 登出/强制下线：撤销会话行 + AT jti 撤销标记。
	Revoke(ctx context.Context, info AuthInfo) error
	// Authenticate 每请求鉴权：本地验签 AT → Redis 撤销标记 → token_version 比对（缓存 60s）。
	Authenticate(ctx context.Context, bearer string) (*AuthInfo, error)
}

// OTPSender 验证码发送的窄接口（otp 域实现）。
// 返回本次发送后的冷却秒数；频控/额度/熔断判定在 otp 域内完成。
type OTPSender interface {
	Send(ctx context.Context, channel, dest, scene, ip, deviceID string) (cooldownSeconds int64, err error)
}

// Config 服务级行为参数。
type Config struct {
	ATTTLSeconds    int64 // 900
	RTTTLSeconds    int64 // 30d
	StateTTLSeconds int64 // 600
	CodeTTLSeconds  int64 // 120
	CaptchaMaxFails int64 // 人机验证失败锁定阈值（与密码失败共用阈值语义）
	PwdCfg          PasswordGuardConfig
}

// Deps 服务依赖（cmd/ 组装注入）。
type Deps struct {
	Strategies   map[string]LoginStrategy
	Users        UserRepository
	Sessions     SessionIssuer
	Events       EventPublisher
	OTP          OTPSender
	Policy       ChallengePolicy
	Verifier     HumanVerifier
	FailGuard    CaptchaFailGuard
	ThirdParties ThirdPartyStore
	Providers    ThirdPartyRegistry
	Cfg          Config
}

// Service 登录编排用例。
type Service struct {
	strategies map[string]LoginStrategy
	users      UserRepository
	sessions   SessionIssuer
	events     EventPublisher
	otp        OTPSender
	policy     ChallengePolicy
	verifier   HumanVerifier
	failGuard  CaptchaFailGuard
	tpStore    ThirdPartyStore
	providers  ThirdPartyRegistry
	cfg        Config
}

func NewService(d Deps) *Service {
	return &Service{
		strategies: d.Strategies, users: d.Users, sessions: d.Sessions,
		events: d.Events, otp: d.OTP, policy: d.Policy, verifier: d.Verifier,
		failGuard: d.FailGuard,
		tpStore:   d.ThirdParties, providers: d.Providers, cfg: d.Cfg,
	}
}

// Login 统一登录编排：
// ① 策略分流 → ③ 触发式人机校验 → ② 凭据校验/建号 → ④′ 封禁判定 → ⑤ 签发 → ⑥ 事件。
func (s *Service) Login(ctx context.Context, in *LoginInput) (*AuthResult, error) {
	strategy, ok := s.strategies[in.Type]
	if !ok {
		return nil, EUnsupportedLoginType("unknown or disabled login type: " + in.Type)
	}
	sc := SceneContext{Scene: SceneLogin, IP: in.IP, DeviceID: in.DeviceID, Identifier: firstNonEmpty(in.Phone, in.Email, in.Identifier)}
	capAudit, err := s.captchaGate(ctx, sc, in.Captcha)
	if err != nil {
		s.events.LoginFailed(ctx, &LoginEvent{
			LoginType: in.Type, IdentifierMasked: maskedOf(in), Result: "failed",
			Reason: reasonOf(err), IP: in.IP, DeviceID: in.DeviceID, Captcha: capAudit,
		})
		return nil, err
	}

	user, isNew, err := strategy.VerifyCredential(ctx, in)
	if err != nil {
		s.events.LoginFailed(ctx, &LoginEvent{
			LoginType: in.Type, IdentifierMasked: maskedOf(in), Result: "failed",
			Reason: reasonOf(err), IP: in.IP, DeviceID: in.DeviceID, Captcha: capAudit,
		})
		return nil, err
	}
	// ④′ 封禁判定：不签发令牌，前端据此单独展示封禁提示。
	if user.Status == UserStatusBanned {
		s.events.LoginFailed(ctx, &LoginEvent{
			UserID: user.ID, LoginType: in.Type, IdentifierMasked: maskedOf(in),
			Result: "failed", Reason: "banned", IP: in.IP, DeviceID: in.DeviceID, Captcha: capAudit,
		})
		return nil, EAccountBanned()
	}

	access, refresh, expiresIn, err := s.sessions.Issue(ctx, user.ID, user.TokenVersion, in.DeviceID, "")
	if err != nil {
		return nil, err
	}
	if isNew {
		s.events.UserCreated(ctx, user.ID)
	}
	s.events.LoginSucceeded(ctx, &LoginEvent{
		UserID: user.ID, LoginType: in.Type, IdentifierMasked: maskedOf(in),
		Result: "succeeded", IP: in.IP, DeviceID: in.DeviceID,
	})
	return &AuthResult{
		User: user, IsNewUser: isNew, OnboardingRequired: user.OnboardingRequired(),
		AccessToken: access, RefreshToken: refresh, ExpiresIn: expiresIn, TokenType: "Bearer",
	}, nil
}

// SendOtp 发送验证码：归一化 → 冷却/额度（otp 域内）→ 触发式人机校验 → 发送。
func (s *Service) SendOtp(ctx context.Context, channel, destination, nation, scene string, captcha *ChallengeResponse, ip, deviceID string) (int64, error) {
	var dest string
	var err error
	switch channel {
	case "phone":
		dest, err = NormalizePhone(nation, destination)
	case "email":
		dest, err = NormalizeEmail(destination)
	default:
		return 0, EBadRequest("unknown channel: " + channel)
	}
	if err != nil {
		return 0, err
	}
	sc := SceneContext{Scene: SceneOTPSend, IP: ip, DeviceID: deviceID, Identifier: dest}
	if _, err := s.captchaGate(ctx, sc, captcha); err != nil {
		return 0, err
	}
	return s.otp.Send(ctx, channel, dest, scene, ip, deviceID)
}

// ThirdPartyAuthorize web 流程第一步：签发一次性 state → 平台授权页地址。
func (s *Service) ThirdPartyAuthorize(ctx context.Context, provider, platform string) (string, error) {
	prov, ok := s.providers.Get(provider)
	if !ok {
		return "", EUnsupportedLoginType("unknown provider: " + provider)
	}
	state := randomToken(16) // 32 hex chars ≥ 128bit
	if err := s.tpStore.SaveState(ctx, state, platform, s.cfg.StateTTLSeconds); err != nil {
		return "", err
	}
	return prov.AuthorizeURL(ctx, state, platform)
}

// ThirdPartyCallback 回跳：校验一次性 state → 把一次性 code 交回前端调统一 Login。
func (s *Service) ThirdPartyCallback(ctx context.Context, state, code string) (string, error) {
	if state == "" || code == "" {
		return "", EOauthStateInvalid()
	}
	if _, err := s.tpStore.ConsumeState(ctx, state); err != nil {
		return "", EOauthStateInvalid()
	}
	// code 的真实校验发生在统一 Login 的 ExchangeIdentity（一次性消费）。
	return code, nil
}

// captchaAudit captcha 判定的审计视图（随登录事件入 login_audit，§4.5 不变量 5）。
type captchaAudit struct {
	ChallengeID string
	Kind        string
	Result      string // required | passed | failed
}

// captchaGate 触发式人机校验（§4.5 流程）：
// policy 判定是否需要 → 无 token/不可解码 → CAPTCHA_REQUIRED（现场签发挑战随错误下发）；
// 有 token → Verify → 通过继续业务；不通过 → CAPTCHA_FAILED（携带新 Challenge 供重试）。
func (s *Service) captchaGate(ctx context.Context, sc SceneContext, resp *ChallengeResponse) (captchaAudit, error) {
	required, err := s.policy.Evaluate(ctx, sc)
	if err != nil {
		return captchaAudit{}, err
	}
	if !required {
		return captchaAudit{}, nil
	}
	if locked, lerr := s.failGuard.Locked(ctx, sc); lerr == nil && locked {
		// 锁定窗口内：验证路径整体拒绝（只拦人机验证路径，不影响其他入口）。
		return captchaAudit{}, ECaptchaLocked()
	}
	if resp == nil {
		// 未出示 token（或 handler 判定无效）→ 现场签发挑战随 CAPTCHA_REQUIRED 下发，省一次往返。
		return captchaAudit{Result: "required"}, ECaptchaRequired(s.tryIssueChallenge(ctx, sc))
	}
	res, verr := s.verifier.Verify(ctx, resp)
	if verr != nil {
		return captchaAudit{}, verr // 基础设施故障
	}
	audit := captchaAudit{ChallengeID: resp.ChallengeID, Kind: string(s.verifier.Kind())}
	if res.Passed {
		audit.Result = "passed"
		return audit, nil
	}
	// 失败：记录计数（退避/冷却→锁定的输入），响应携带新 Challenge 供重试。
	if s.failGuard != nil {
		_, _ = s.failGuard.Fail(ctx, sc, s.cfg.CaptchaMaxFails)
	}
	audit.Result = "failed"
	return audit, ECaptchaFailed(s.tryIssueChallenge(ctx, sc))
}

// tryIssueChallenge 现场签发挑战；verifier 不支持/基础设施故障时返回 nil（错误体不带挑战）。
func (s *Service) tryIssueChallenge(ctx context.Context, sc SceneContext) *Challenge {
	ch, err := s.verifier.Issue(ctx, &ChallengeRequest{Scene: sc.Scene, ClientIP: sc.IP, DeviceID: sc.DeviceID})
	if err != nil {
		return nil
	}
	return ch
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

func maskedOf(in *LoginInput) string {
	switch {
	case in.Phone != "":
		return MaskIdentifier(in.Phone)
	case in.Email != "":
		return MaskIdentifier(in.Email)
	case in.Identifier != "":
		return MaskIdentifier(in.Identifier)
	case in.ThirdParty.Code != "":
		return "thirdparty:" + in.ThirdParty.Provider
	}
	return "***"
}

func reasonOf(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Reason
	}
	return "internal"
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
