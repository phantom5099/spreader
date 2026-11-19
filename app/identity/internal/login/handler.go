package login

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	kerrors "github.com/go-kratos/kratos/v3/errors"
	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// Handler 传输适配层：HTTP 请求/响应 ↔ 领域类型，保持薄。
type Handler struct {
	svc      *Service
	users    UserRepository
	sessions SessionIssuer
	verifier HumanVerifier
}

// 路由级请求预算：外层 khttp.Timeout 是最后防线，这里才是每条路径的真实上限。
// 含外部通道的路径必须更宽——公网 TLS 握手 + RTT 与短信主备降级会吃掉大部分预算；
// 收窄的价值在于超时点落在具体调用上（错误可映射），而不是整条请求被外层统一截断。
const (
	budgetLocal    = 3 * time.Second // 纯本地依赖：Redis + PG
	budgetExternal = 8 * time.Second // 叠加短信 / 邮件 / 第三方等跨公网调用

	// MaxBudget 最宽的路由预算。进程级请求预算必须不小于它，否则路由级预算会被外层提前截断，
	// 收窄就失去了「让超时落在具体调用上」的意义。启动时据此校验配置。
	MaxBudget = budgetExternal
)

// NewHandler 构建。
func NewHandler(svc *Service, users UserRepository, sessions SessionIssuer, verifier HumanVerifier) *Handler {
	return &Handler{svc: svc,
		users:    users,
		sessions: sessions,
		verifier: verifier,
	}
}

// MapError 领域错误 → kratos 错误（HTTP 状态 + IAM.* reason + retryable/challenge 元数据）。
func MapError(err error) error {
	if err == nil {
		return nil
	}
	var e *Error
	if !errors.As(err, &e) {
		return err
	}
	ke := kerrors.New(e.HTTP, e.Reason, e.Message)
	md := map[string]string{}
	if e.Retryable {
		md["retryable"] = "true"
	}
	if e.Captcha != nil {
		b, _ := json.Marshal(captchaWire(e.Captcha))
		md["challenge"] = string(b)
	}
	if len(md) > 0 {
		return ke.WithMetadata(md)
	}
	return ke
}

// clientIP 取边缘代理写入的真实客户端 IP：仅信任 X-Real-IP / X-Forwarded-For 首段。
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	return ""
}

// authenticate 从 Authorization 提取并校验登录态。
func (h *Handler) authenticate(ctx context.Context, r *http.Request) (*AuthInfo, error) {
	bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	info, err := h.sessions.Authenticate(ctx, bearer)
	if err != nil {
		return nil, MapError(err)
	}
	if info == nil {
		return nil, MapError(ETokenInvalid("unauthenticated"))
	}
	return info, nil
}

// SendOtp 发送验证码。发送不是登录动作：限流维度、重发语义、幂等要求均与登录不同。
func (h *Handler) SendOtp(c khttp.Context) error {
	var req SendOtpRequestDTO
	if err := c.Bind(&req); err != nil {
		return MapError(EBadRequest("invalid request body"))
	}
	ctx, cancel := context.WithTimeout(c, budgetExternal)
	defer cancel()
	cd, err := h.svc.SendOtp(ctx, req.Channel, req.Destination, req.Nation,
		decodeCaptchaToken(req.CaptchaToken), clientIP(c.Request()), "")
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &SendOtpResponseDTO{CooldownSeconds: cd})
}

// Login 统一登录入口：按 type 分流到策略实现。
func (h *Handler) Login(c khttp.Context) error {
	var req LoginRequestDTO
	if err := c.Bind(&req); err != nil {
		return MapError(EBadRequest("invalid request body"))
	}
	in := &LoginInput{
		Type:     loginTypeName(req.Type),
		DeviceID: req.DeviceID,
		Captcha:  decodeCaptchaToken(req.CaptchaToken),
		IP:       clientIP(c.Request()),
	}
	switch {
	case req.PhoneOtp != nil:
		in.Nation, in.Phone, in.Code = req.PhoneOtp.Nation, req.PhoneOtp.Phone, req.PhoneOtp.Code
	case req.EmailOtp != nil:
		in.Email, in.Code = req.EmailOtp.Email, req.EmailOtp.Code
	case req.Password != nil:
		in.Identifier, in.Password = req.Password.Identifier, req.Password.Password
	case req.ThirdParty != nil:
		in.ThirdParty = ThirdPartyCredential{
			Provider: req.ThirdParty.Provider,
			Code:     req.ThirdParty.Code,
			State:    req.ThirdParty.State,
			Platform: req.ThirdParty.Platform,
		}
	default:
		return MapError(EUnsupportedLoginType("missing credential"))
	}
	// 第三方登录分支要跨公网换取身份，与短信同档预算。
	ctx, cancel := context.WithTimeout(c, budgetExternal)
	defer cancel()
	res, err := h.svc.Login(ctx, in)
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &LoginResponseDTO{
		User:               toUserDTO(res.User),
		IsNewUser:          res.IsNewUser,
		OnboardingRequired: res.OnboardingRequired,
		AccessToken:        res.AccessToken,
		RefreshToken:       res.RefreshToken,
		ExpiresIn:          res.ExpiresIn,
		TokenType:          res.TokenType,
	})
}

// IssueCaptcha 预取人机验证挑战：otp:send 触发风控时也需前置校验。
func (h *Handler) IssueCaptcha(c khttp.Context) error {
	var req IssueCaptchaRequestDTO
	if err := c.Bind(&req); err != nil {
		return MapError(EBadRequest("invalid request body"))
	}
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	ch, err := h.verifier.Issue(ctx, &ChallengeRequest{
		Scene:    ChallengeScene(req.Scene),
		ClientIP: clientIP(c.Request()),
		DeviceID: req.DeviceID,
	})
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &IssueCaptchaResponseDTO{Challenge: &CaptchaChallengeDTO{
		ChallengeID: ch.ChallengeID,
		Kind:        string(ch.Kind),
		Payload:     string(ch.Payload),
		ExpiresIn:   ch.ExpiresAt - time.Now().Unix(),
	}})
}

// RefreshToken 刷新 AT：RT 轮换 + 重放检测（与 RT 会话模型绑定）。
func (h *Handler) RefreshToken(c khttp.Context) error {
	var req RefreshTokenRequestDTO
	if err := c.Bind(&req); err != nil {
		return MapError(EBadRequest("invalid request body"))
	}
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	access, refresh, expiresIn, _, err := h.sessions.Refresh(ctx, req.RefreshToken, "")
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &RefreshTokenResponseDTO{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    expiresIn,
		TokenType:    "Bearer",
	})
}

// Logout 登出当前会话（天然幂等）。
func (h *Handler) Logout(c khttp.Context) error {
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	info, err := h.authenticate(ctx, c.Request())
	if err != nil {
		return err
	}
	if rerr := h.sessions.Revoke(ctx, *info); rerr != nil {
		return MapError(rerr)
	}
	return c.Result(http.StatusOK, &EmptyDTO{})
}

// GetMe 当前账号（含 onboarding_required）：登录后引导资料完善，仅提示不拦截。
func (h *Handler) GetMe(c khttp.Context) error {
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	info, err := h.authenticate(ctx, c.Request())
	if err != nil {
		return err
	}
	u, err := h.users.GetByID(ctx, info.UserID)
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &GetMeResponseDTO{User: toUserDTO(u), OnboardingRequired: u.OnboardingRequired()})
}

// ThirdPartyAuthorize 签发一次性 state → 返回第三方授权页地址（web 流程第一步）。
func (h *Handler) ThirdPartyAuthorize(c khttp.Context) error {
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	u, err := h.svc.ThirdPartyAuthorize(ctx, c.Query().Get("provider"), c.Query().Get("platform"))
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &ThirdPartyAuthorizeResponseDTO{AuthorizationURL: u})
}

// ThirdPartyCallback 授权回跳：校验 state → 返回一次性 code 给前端调统一 Login。
func (h *Handler) ThirdPartyCallback(c khttp.Context) error {
	ctx, cancel := context.WithTimeout(c, budgetLocal)
	defer cancel()
	code, err := h.svc.ThirdPartyCallback(ctx, c.Query().Get("state"), c.Query().Get("code"))
	if err != nil {
		return MapError(err)
	}
	return c.Result(http.StatusOK, &ThirdPartyCallbackResponseDTO{Code: code})
}

// ── 人机验证的传输形状 ──

// captchaChallengeDTO problem+json 错误体扩展成员 challenge 的形状。
type captchaChallengeDTO struct {
	ChallengeID string `json:"challenge_id"`
	Kind        string `json:"kind"` // selfhosted | turnstile | ...
	Payload     string `json:"payload"`
	ExpiresIn   int64  `json:"expires_in"` // 相对秒：客户端不做时钟比对
}

// captchaWire 领域挑战 → 传输形状（绝对过期 → 相对 TTL）。
func captchaWire(ch *Challenge) captchaChallengeDTO {
	return captchaChallengeDTO{
		ChallengeID: ch.ChallengeID,
		Kind:        string(ch.Kind),
		Payload:     string(ch.Payload),
		ExpiresIn:   ch.ExpiresAt - time.Now().Unix(),
	}
}

// captchaTokenPayload captcha_token 的载荷：base64url(JSON)，由客户端构造回传。
type captchaTokenPayload struct {
	ChallengeID string `json:"cid"`
	Answer      string `json:"ans"`
	ElapsedMs   int64  `json:"elapsed_ms,omitempty"`
	Fingerprint string `json:"fp,omitempty"`
}

// decodeCaptchaToken 线上 token → 领域判定输入；空/不可解码返回 nil（≡ 未出示，
// captchaGate 会现场签发新挑战随 CAPTCHA_REQUIRED 下发）。
func decodeCaptchaToken(token string) *ChallengeResponse {
	if token == "" {
		return nil
	}
	b, err := base64.URLEncoding.DecodeString(token)
	if err != nil {
		return nil
	}
	var tp captchaTokenPayload
	if err := json.Unmarshal(b, &tp); err != nil || tp.ChallengeID == "" {
		return nil
	}
	return &ChallengeResponse{
		ChallengeID: tp.ChallengeID,
		Answer:      []byte(tp.Answer),
		ElapsedMs:   tp.ElapsedMs,
		Fingerprint: tp.Fingerprint,
	}
}
