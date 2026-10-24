package login

import "context"

// ── 第三方登录契约─────────────────────────────
// 适配实现（platform/thirdparty + dev/thirdparty_mock）与编排（service.go）之间的全部契约；
// provider 由每次登录请求逐次携带，注册表在 cmd/ 组装（buildProviders）。

// ThirdPartyCredential 提供方凭据（适配层输入，与服务端口一一对应）。
type ThirdPartyCredential struct {
	Provider string
	Code     string
	State    string
	Platform string
}

// ThirdPartyAccountLink 主体级绑定（third_party_accounts 行）。
type ThirdPartyAccountLink struct {
	UserID    string
	Provider  string
	SubjectID string
}

// ThirdPartyRepository 两级身份表仓储。
type ThirdPartyRepository interface {
	// FindIdentity 应用级查找键：(provider, appid, external_id)。返回含 UserID 链接。
	FindIdentity(ctx context.Context, provider, appid, externalID string) (*ThirdPartyIdentity, error)
	// FindAccount 主体级归并查找：(provider, subject_id)。
	FindAccount(ctx context.Context, provider, subjectID string) (*ThirdPartyAccountLink, error)
	// CreateLinkedUser 建号 + 主体级绑定 + 应用级身份，同一事务（「账号在、绑定丢」不可能中间态）。
	// created=false 表示并发下对方已建（实现内已回查并返回对方结果）。
	CreateLinkedUser(ctx context.Context, ident *ThirdPartyIdentity) (u *User, created bool, err error)
	// CreateAccount 主体级绑定：ON CONFLICT (provider, subject_id) DO NOTHING；
	// 冲突即「同一 subject 已绑另一账号」，实现内返回 ErrSubjectConflict。
	CreateAccount(ctx context.Context, userID, provider, subjectID string) error
	// CreateIdentity 补插应用级身份行（同人多端归并路径）：ON CONFLICT DO NOTHING 后回查。
	CreateIdentity(ctx context.Context, userID string, ident *ThirdPartyIdentity) (created bool, err error)
	// TouchIdentityLastLogin 命中已有身份时更新 last_login_at（§5.1）。
	TouchIdentityLastLogin(ctx context.Context, provider, appid, externalID string) error
}

// ErrSubjectConflict 哨兵：同一 subject_id 已指向另一本地账号，处置走绑定/合并流程。
var ErrSubjectConflict = subjectConflictError{}

type subjectConflictError struct{}

func (subjectConflictError) Error() string { return "subject already linked to another account" }
