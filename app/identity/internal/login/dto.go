package login

// 传输层形状：HTTP 请求/响应体。只做 JSON 编解码与字段映射，不含业务规则。
// 领域类型（User / LoginInput / Challenge …）不 tag 成 JSON，二者在 handler 中转换。

// LoginType 登录方式。线上取值沿用原先 protojson 的输出，客户端不需要改动。
type LoginType string

// 登录方式取值。
const (
	LoginTypeUnspecified LoginType = "LOGIN_TYPE_UNSPECIFIED"
	LoginTypePhoneOTP    LoginType = "LOGIN_TYPE_PHONE_OTP"
	LoginTypeEmailOTP    LoginType = "LOGIN_TYPE_EMAIL_OTP"
	LoginTypePassword    LoginType = "LOGIN_TYPE_PASSWORD"
	LoginTypeThirdParty  LoginType = "LOGIN_TYPE_THIRD_PARTY"
)

// ErrorReason 业务错误码（problem+json 的 code 成员）。
type ErrorReason string

// 业务错误码取值：对外契约的一部分，改名等于破坏兼容。
const (
	ReasonUnsupportedLoginType  ErrorReason = "IAM_UNSUPPORTED_LOGIN_TYPE"
	ReasonOtpSendTooFrequent    ErrorReason = "IAM_OTP_SEND_TOO_FREQUENT"
	ReasonOtpDailyLimitExceeded ErrorReason = "IAM_OTP_DAILY_LIMIT_EXCEEDED"
	ReasonOtpInvalid            ErrorReason = "IAM_OTP_INVALID"
	ReasonInvalidCredentials    ErrorReason = "IAM_INVALID_CREDENTIALS"
	ReasonAccountLocked         ErrorReason = "IAM_ACCOUNT_LOCKED"
	ReasonAccountBanned         ErrorReason = "IAM_ACCOUNT_BANNED"
	ReasonOauthStateInvalid     ErrorReason = "IAM_OAUTH_STATE_INVALID"
	ReasonRefreshTokenReused    ErrorReason = "IAM_REFRESH_TOKEN_REUSED"
	ReasonTokenExpired          ErrorReason = "IAM_TOKEN_EXPIRED"
	ReasonCaptchaRequired       ErrorReason = "IAM_CAPTCHA_REQUIRED"
	ReasonCaptchaFailed         ErrorReason = "IAM_CAPTCHA_FAILED"
	ReasonChannelUnavailable    ErrorReason = "IAM_CHANNEL_UNAVAILABLE"
	ReasonThirdPartyAuthFailed  ErrorReason = "IAM_THIRDPARTY_AUTH_FAILED"
	ReasonBadRequest            ErrorReason = "IAM_BAD_REQUEST"
	ReasonTooManyAttempts       ErrorReason = "IAM_TOO_MANY_ATTEMPTS"
)

// SendOtpRequestDTO 发送验证码。destination 为手机号原始输入或邮箱，随 nation 归一。
// 没有 scene/purpose 字段：客户端只提供号码与验证码，不声明这个码用来干什么。
// 用途由服务端在调用处给定；登录的四种方式共用 /v1/auth/login，type 只区分凭据形式，
// 不区分用途，路由本身也读不出用途。
type SendOtpRequestDTO struct {
	Destination  string `json:"destination"`
	Channel      string `json:"channel"`       // phone | email
	Nation       string `json:"nation"`        // channel=phone 时必填：用户选择的区号种类
	CaptchaToken string `json:"captcha_token"` // 触发式策略要求时必填
}

// SendOtpResponseDTO 发送结果。
type SendOtpResponseDTO struct {
	CooldownSeconds int64 `json:"cooldown_seconds"`
}

// UserDTO 账号视图。
type UserDTO struct {
	ID        string `json:"id"`
	Phone     string `json:"phone"` // E.164，未绑定则空
	Email     string `json:"email"` // 未绑定则空
	Nickname  string `json:"nickname"`
	AvatarURL string `json:"avatar_url"`
	Status    string `json:"status"` // ACTIVE / RESTRICTED / BANNED / ...
}

// PhoneOTPCredentialDTO 手机验证码凭据。
type PhoneOTPCredentialDTO struct {
	Nation string `json:"nation"`
	Phone  string `json:"phone"`
	Code   string `json:"code"`
}

// EmailOTPCredentialDTO 邮箱验证码凭据。
type EmailOTPCredentialDTO struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// PasswordCredentialDTO 口令凭据；identifier 手机/邮箱自动判别。
type PasswordCredentialDTO struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

// ThirdPartyCredentialDTO 第三方登录凭据。
type ThirdPartyCredentialDTO struct {
	Provider string `json:"provider"` // wechat_mock（v1）| 真实平台接入后追加
	Code     string `json:"code"`     // 授权码（网页回跳 / 端上 SDK 直取）
	State    string `json:"state"`    // web 流程防 CSRF（一次性）
	Platform string `json:"platform"` // app | mini_program | web
}

// LoginRequestDTO 统一登录入口的请求体；四种凭据只应出现一个。
type LoginRequestDTO struct {
	Type         LoginType                `json:"type"`
	PhoneOtp     *PhoneOTPCredentialDTO   `json:"phone_otp,omitempty"`
	EmailOtp     *EmailOTPCredentialDTO   `json:"email_otp,omitempty"`
	Password     *PasswordCredentialDTO   `json:"password,omitempty"`
	ThirdParty   *ThirdPartyCredentialDTO `json:"third_party,omitempty"`
	DeviceID     string                   `json:"device_id"`
	CaptchaToken string                   `json:"captcha_token"`
}

// LoginResponseDTO 登录结果。
type LoginResponseDTO struct {
	User               *UserDTO `json:"user"`
	IsNewUser          bool     `json:"is_new_user"`
	OnboardingRequired bool     `json:"onboarding_required"`
	AccessToken        string   `json:"access_token"`
	RefreshToken       string   `json:"refresh_token"`
	ExpiresIn          int64    `json:"expires_in"` // AT 有效期（秒）
	TokenType          string   `json:"token_type"` // Bearer
}

// IssueCaptchaRequestDTO 预取人机验证挑战。
type IssueCaptchaRequestDTO struct {
	Scene    string `json:"scene"`     // login | otp_send | ...
	DeviceID string `json:"device_id"` // 风控信号
}

// CaptchaChallengeDTO 挑战视图。
type CaptchaChallengeDTO struct {
	ChallengeID string `json:"challenge_id"` // 服务端一次性 token
	Kind        string `json:"kind"`         // text | turnstile | ...
	Payload     string `json:"payload"`      // 各 kind 自解释
	ExpiresIn   int64  `json:"expires_in"`   // 相对秒，客户端不做时钟比对
}

// IssueCaptchaResponseDTO 挑战响应。
type IssueCaptchaResponseDTO struct {
	Challenge *CaptchaChallengeDTO `json:"challenge"`
}

// RefreshTokenRequestDTO 刷新请求。
type RefreshTokenRequestDTO struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshTokenResponseDTO 刷新结果。
type RefreshTokenResponseDTO struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// GetMeResponseDTO 当前账号。
type GetMeResponseDTO struct {
	User               *UserDTO `json:"user"`
	OnboardingRequired bool     `json:"onboarding_required"`
}

// ThirdPartyAuthorizeRequestDTO 第三方授权第一步。
type ThirdPartyAuthorizeRequestDTO struct {
	Provider string `json:"provider"` // wechat_mock（v1）
	Platform string `json:"platform"` // web 流程需要 state
}

// ThirdPartyAuthorizeResponseDTO 授权页地址。
type ThirdPartyAuthorizeResponseDTO struct {
	AuthorizationURL string `json:"authorization_url"`
}

// ThirdPartyCallbackRequestDTO 授权回跳参数。
type ThirdPartyCallbackRequestDTO struct {
	State string `json:"state"`
	Code  string `json:"code"`
}

// ThirdPartyCallbackResponseDTO 一次性授权码，前端携其调用统一 Login。
type ThirdPartyCallbackResponseDTO struct {
	Code string `json:"code"`
}

// EmptyDTO 无请求体/无返回体的端点占位，保持响应为 `{}` 而非 `null`。
type EmptyDTO struct{}

// loginTypeName 传输枚举 → 领域策略键；未识别返回空串（由 Service 判为 UNSUPPORTED）。
func loginTypeName(t LoginType) string {
	switch t {
	case LoginTypePhoneOTP:
		return "phone_otp"
	case LoginTypeEmailOTP:
		return "email_otp"
	case LoginTypePassword:
		return "password"
	case LoginTypeThirdParty:
		return "thirdparty"
	default:
		return ""
	}
}

// toUserDTO 领域账号 → 传输视图。
func toUserDTO(u *User) *UserDTO {
	if u == nil {
		return nil
	}
	return &UserDTO{
		ID: u.ID, Phone: u.Phone, Email: u.Email,
		Nickname: u.Nickname, AvatarURL: u.AvatarURL, Status: string(u.Status),
	}
}
