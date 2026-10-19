package login

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	kerrors "github.com/go-kratos/kratos/v3/errors"
	kratosMiddleware "github.com/go-kratos/kratos/v3/middleware"
	"github.com/go-kratos/kratos/v3/transport"

	v1 "github.com/phantom5099/spreader/api/identity/v1"
)

// Handler proto ↔ domain 的薄适配：实现 v1.IdentityServiceHTTPServer / v1.IdentityServiceServer。
type Handler struct {
	v1.UnimplementedIdentityServiceServer
	svc      *Service
	users    UserRepository
	sessions SessionIssuer
	verifier HumanVerifier
}

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

func clientIP(ctx context.Context) string {
	if tr, ok := transport.FromServerContext(ctx); ok {
		if h := tr.RequestHeader(); h != nil {
			if v := h.Get("X-Real-IP"); v != "" {
				return v
			}
			if v := h.Get("X-Forwarded-For"); v != "" {
				return strings.TrimSpace(strings.Split(v, ",")[0])
			}
		}
	}
	return ""
}

// SendOtp 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) SendOtp(ctx context.Context, req *v1.SendOtpRequest) (*v1.SendOtpResponse, error) {
	cd, err := h.svc.SendOtp(ctx, req.GetChannel(), req.GetDestination(), req.GetNation(),
		req.GetScene(), decodeCaptchaToken(req.GetCaptchaToken()), clientIP(ctx), "")
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.SendOtpResponse{CooldownSeconds: cd}, nil
}

// Login 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) Login(ctx context.Context, req *v1.LoginRequest) (*v1.LoginResponse, error) {
	in := &LoginInput{
		Type:     loginTypeName(req.GetType()),
		DeviceID: req.GetDeviceId(),
		Captcha:  decodeCaptchaToken(req.GetCaptchaToken()),
		IP:       clientIP(ctx),
	}
	switch c := req.GetCredential().(type) {
	case *v1.LoginRequest_PhoneOtp:
		in.Nation, in.Phone, in.Code = c.PhoneOtp.GetNation(), c.PhoneOtp.GetPhone(), c.PhoneOtp.GetCode()
	case *v1.LoginRequest_EmailOtp:
		in.Email, in.Code = c.EmailOtp.GetEmail(), c.EmailOtp.GetCode()
	case *v1.LoginRequest_Password:
		in.Identifier, in.Password = c.Password.GetIdentifier(), c.Password.GetPassword()
	case *v1.LoginRequest_ThirdParty:
		in.ThirdParty = ThirdPartyCredential{
			Provider: c.ThirdParty.GetProvider(),
			Code:     c.ThirdParty.GetCode(),
			State:    c.ThirdParty.GetState(),
			Platform: c.ThirdParty.GetPlatform(),
		}
	default:
		return nil, MapError(EUnsupportedLoginType("missing credential"))
	}
	res, err := h.svc.Login(ctx, in)
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.LoginResponse{
		User:               toProtoUser(res.User),
		IsNewUser:          res.IsNewUser,
		OnboardingRequired: res.OnboardingRequired,
		AccessToken:        res.AccessToken,
		RefreshToken:       res.RefreshToken,
		ExpiresIn:          res.ExpiresIn,
		TokenType:          res.TokenType,
	}, nil
}

// IssueCaptcha 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) IssueCaptcha(ctx context.Context, req *v1.IssueCaptchaRequest) (*v1.IssueCaptchaResponse, error) {
	ch, err := h.verifier.Issue(ctx, &ChallengeRequest{
		Scene:    ChallengeScene(req.GetScene()),
		ClientIP: clientIP(ctx),
		DeviceID: req.GetDeviceId(),
	})
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.IssueCaptchaResponse{Challenge: &v1.CaptchaChallenge{
		ChallengeId: ch.ChallengeID,
		Kind:        string(ch.Kind),
		Payload:     string(ch.Payload),
		ExpiresIn:   ch.ExpiresAt - time.Now().Unix(),
	}}, nil
}

// RefreshToken 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) RefreshToken(ctx context.Context, req *v1.RefreshTokenRequest) (*v1.RefreshTokenResponse, error) {
	access, refresh, expiresIn, _, err := h.sessions.Refresh(ctx, req.GetRefreshToken(), "")
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.RefreshTokenResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    expiresIn,
		TokenType:    "Bearer",
	}, nil
}

// Logout 实现 v1.IdentityServiceHTTPServer：天然幂等。
func (h *Handler) Logout(ctx context.Context, _ *v1.LogoutRequest) (*v1.LogoutResponse, error) {
	info := AuthInfoFrom(ctx)
	if info == nil {
		return nil, MapError(ETokenInvalid("unauthenticated"))
	}
	if err := h.sessions.Revoke(ctx, *info); err != nil {
		return nil, MapError(err)
	}
	return &v1.LogoutResponse{}, nil
}

// GetMe 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) GetMe(ctx context.Context, _ *v1.GetMeRequest) (*v1.GetMeResponse, error) {
	info := AuthInfoFrom(ctx)
	if info == nil {
		return nil, MapError(ETokenInvalid("unauthenticated"))
	}
	u, err := h.users.GetByID(ctx, info.UserID)
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.GetMeResponse{User: toProtoUser(u), OnboardingRequired: u.OnboardingRequired()}, nil
}

// ThirdPartyAuthorize 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) ThirdPartyAuthorize(ctx context.Context, req *v1.ThirdPartyAuthorizeRequest) (*v1.ThirdPartyAuthorizeResponse, error) {
	u, err := h.svc.ThirdPartyAuthorize(ctx, req.GetProvider(), req.GetPlatform())
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.ThirdPartyAuthorizeResponse{AuthorizationUrl: u}, nil
}

// ThirdPartyCallback 实现 v1.IdentityServiceHTTPServer。
func (h *Handler) ThirdPartyCallback(ctx context.Context, req *v1.ThirdPartyCallbackRequest) (*v1.ThirdPartyCallbackResponse, error) {
	code, err := h.svc.ThirdPartyCallback(ctx, req.GetState(), req.GetCode())
	if err != nil {
		return nil, MapError(err)
	}
	return &v1.ThirdPartyCallbackResponse{Code: code}, nil
}

func toProtoUser(u *User) *v1.User {
	return &v1.User{
		Id: u.ID, Phone: u.Phone, Email: u.Email,
		Nickname: u.Nickname, AvatarUrl: u.AvatarURL, Status: string(u.Status),
	}
}

func loginTypeName(t v1.LoginType) string {
	switch t {
	case v1.LoginType_LOGIN_TYPE_PHONE_OTP:
		return "phone_otp"
	case v1.LoginType_LOGIN_TYPE_EMAIL_OTP:
		return "email_otp"
	case v1.LoginType_LOGIN_TYPE_PASSWORD:
		return "password"
	case v1.LoginType_LOGIN_TYPE_THIRD_PARTY:
		return "thirdparty"
	default:
		return ""
	}
}

// AuthMiddleware 登录态中间件：受保护操作注入 AuthInfo；同时为所有操作提取客户端 IP。
func AuthMiddleware(iss SessionIssuer) kratosMiddleware.Middleware {
	return func(h kratosMiddleware.Handler) kratosMiddleware.Handler {
		return func(ctx context.Context, req any) (any, error) {
			if tr, ok := transport.FromServerContext(ctx); ok {
				switch tr.Operation() {
				case v1.OperationIdentityServiceGetMe, v1.OperationIdentityServiceLogout:
					bearer := strings.TrimPrefix(tr.RequestHeader().Get("Authorization"), "Bearer ")
					info, err := iss.Authenticate(ctx, bearer)
					if err != nil {
						return nil, MapError(err)
					}
					ctx = WithAuthInfo(ctx, info)
				}
			}
			return h(ctx, req)
		}
	}
}

var (
	_ v1.IdentityServiceHTTPServer = (*Handler)(nil)
	_ v1.IdentityServiceServer     = (*Handler)(nil)
)

// ── 人机验证的传输形状）──

// captchaChallengeDTO problem+json 错误体扩展成员 challenge 的形状）。
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
