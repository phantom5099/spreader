package login

import "context"

// UserStatus 账号状态：权限边界判定依据。
type UserStatus string

const (
	UserStatusActive     UserStatus = "ACTIVE"
	UserStatusRestricted UserStatus = "RESTRICTED"
	UserStatusBanned     UserStatus = "BANNED"
)

// User 用户主档视图（不含口令等凭据——常规查询路径永不触达 user_credentials）。
type User struct {
	ID            string
	Phone         string // E.164，未绑定为空
	Email         string // 未绑定为空
	Nickname      string
	AvatarURL     string
	Status        UserStatus
	TokenVersion  int64
	CreatedAtUnix int64
}

// OnboardingRequired 服务端按资料空缺实时推导，不落列；仅提示不拦截（昵称/头像不强制）。
func (u *User) OnboardingRequired() bool {
	return u.Nickname == "" || u.AvatarURL == ""
}

// ThirdPartyIdentity 应用级登录身份（行 = 提供方在某应用下的一个身份）。
// 字段全部来自提供方回调，经适配层归一化；UserID 是到本地账号的链接。
type ThirdPartyIdentity struct {
	UserID     string
	Provider   string
	AppID      string
	ExternalID string // 应用内标识：微信 openid / Google sub / GitHub id
	SubjectID  string // 用户级稳定标识（微信 unionid / Google sub / GitHub id），可为空
	Nickname   string
	AvatarURL  string
}

// AuthResult 登录/刷新的成功产物。
type AuthResult struct {
	User               *User
	IsNewUser          bool
	OnboardingRequired bool
	AccessToken        string
	RefreshToken       string
	ExpiresIn          int64 // AT 有效期（秒）
	TokenType          string
}

// AuthInfo 每请求鉴权后的身份信息（中间件写入 context）。
type AuthInfo struct {
	UserID        string
	SessionID     string // = FamilyID（一行 = 一次登录的轮换链）
	JTI           string
	ExpiresAtUnix int64
}

// contextKey 私有键类型：防跨包伪造。
type contextKey struct{}

var authInfoKey = contextKey{}

// WithAuthInfo 中间件写入鉴权信息。
func WithAuthInfo(ctx context.Context, info *AuthInfo) context.Context {
	return context.WithValue(ctx, authInfoKey, info)
}

// AuthInfoFrom 读取鉴权信息；未鉴权返回 nil。
func AuthInfoFrom(ctx context.Context) *AuthInfo {
	info, _ := ctx.Value(authInfoKey).(*AuthInfo) // 中间件未写入 = 未鉴权，返回 nil 由路由层 401
	return info
}
