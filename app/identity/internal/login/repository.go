package login

import (
	"context"
	"errors"
)

// ErrNotFound 仓储统一哨兵：查询目标不存在。驱动错误不得穿透到领域层。
var ErrNotFound = notFoundError{}

type notFoundError struct{}

func (notFoundError) Error() string { return "not found" }

// IsNotFound / IsSubjectConflict 统一哨兵判断。
func IsNotFound(err error) bool        { return errors.Is(err, ErrNotFound) }
func IsSubjectConflict(err error) bool { return errors.Is(err, ErrSubjectConflict) }

// UserRepository 用户主档仓储（login 域声明，platform/postgres 实现）。
// 唯一约束 + ON CONFLICT DO NOTHING + 回查在实现内完成：并发建号只有一方 created=true。
type UserRepository interface {
	GetByID(ctx context.Context, id string) (*User, error)
	GetByPhone(ctx context.Context, e164 string) (*User, error)
	GetByEmail(ctx context.Context, lower string) (*User, error)
	// CreatePhoneUser 建号：唯一约束 (phone) 仲裁；created=false 表示并发下对方已建（已回查）。
	CreatePhoneUser(ctx context.Context, e164 string) (u *User, created bool, err error)
	// CreateEmailUser 建号：唯一约束 (email) 仲裁。
	CreateEmailUser(ctx context.Context, lower string) (u *User, created bool, err error)
}

// CredentialRepository 口令类凭据仓储。返回 Argon2id PHC 串。
type CredentialRepository interface {
	// GetPasswordHash 按 identifier（E.164 手机号或 lower 邮箱）取口令哈希；不存在返回 ErrNotFound。
	GetPasswordHash(ctx context.Context, identifier string) (string, error)
}

// LoginEvent 登录审计事件载荷（login.succeeded / login.failed）。
// identifier 入库前由编排层脱敏（MaskIdentifier），完整手机号/邮箱不进事件与审计表。
type LoginEvent struct {
	UserID           string // 失败且账号不存在时为空
	LoginType        string
	IdentifierMasked string
	Result           string // succeeded | failed
	Reason           string
	IP               string
	DeviceID         string
	Captcha          captchaAudit // 人机验证审计
}

// EventSink 事件出口（实现在 platform/eventlog）。写入失败不改变登录结果：实现吞错并记日志。
type EventSink interface {
	UserCreated(ctx context.Context, userID string)
	LoginSucceeded(ctx context.Context, e *LoginEvent)
	LoginFailed(ctx context.Context, e *LoginEvent)
	SessionRevoked(ctx context.Context, userID, sessionID, familyID, reason string)
}

// ThirdPartyCodePayload 一次性 code 的载荷（mock/回调换取的归一身份材料）。
type ThirdPartyCodePayload struct {
	Provider   string
	AppID      string
	ExternalID string
	SubjectID  string
	Nickname   string
	AvatarURL  string
}

// ThirdPartyStore 第三方登录的 Redis 状态存储（state / code 均一次性）。
type ThirdPartyStore interface {
	SaveState(ctx context.Context, state, platform string, ttlSeconds int64) error
	// ConsumeState 一次性消费；不存在/已消费返回 ErrNotFound。
	ConsumeState(ctx context.Context, state string) (platform string, err error)
	SaveCode(ctx context.Context, code string, p *ThirdPartyCodePayload, ttlSeconds int64) error
	ConsumeCode(ctx context.Context, code string) (ThirdPartyCodePayload, error)
}

// ThirdPartyProvider 单个第三方平台的适配实现（接口由使用方 login 域声明）。
type ThirdPartyProvider interface {
	Provider() string
	// AuthorizeURL web 流程第一步：返回平台授权页地址（携带服务端签发的 state）。
	AuthorizeURL(ctx context.Context, state, platform string) (string, error)
	// ExchangeIdentity code → 归一身份。服务端只信自己换取的标识，客户端永不传身份标识。
	ExchangeIdentity(ctx context.Context, cred ThirdPartyCredential) (*ThirdPartyIdentity, error)
}

// ThirdPartyRegistry provider 注册表（cmd/ 组装；mock/真实实现均在此挂载）。
type ThirdPartyRegistry interface {
	Get(provider string) (ThirdPartyProvider, bool)
}
