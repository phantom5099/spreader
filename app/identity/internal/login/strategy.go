package login

import (
	"context"
	"strings"
)

// LoginInput 领域层登录输入（handler 从 proto 转换而来）。
type LoginInput struct {
	Type       string // phone_otp | email_otp | password | thirdparty
	Nation     string
	Phone      string
	Email      string
	Code       string
	Identifier string
	Password   string
	ThirdParty ThirdPartyCredential
	DeviceID   string
	Captcha    *ChallengeResponse // 已由 handler 解码；nil = 未出示
	IP         string
}

// LoginStrategy 单个登录方式：校验凭据并解析/创建账号（登录即注册：OTP/第三方不存在则建）。
type LoginStrategy interface {
	Type() string
	VerifyCredential(ctx context.Context, in *LoginInput) (*User, bool, error)
}

// StrategyDeps 策略依赖（cmd/ 组装注入）。
type StrategyDeps struct {
	Users        UserRepository
	Credentials  CredentialRepository
	ThirdParties ThirdPartyRepository
	OTP          OTPVerifier
	Pepper       Pepper
	PwdCfg       PasswordGuardConfig
	PwdGuard     PasswordFailGuard
	// Providers 第三方身份提供方注册表（cmd/ 按 config 启用后注入）；
	Providers ThirdPartyRegistry
}

// NewStrategies 构建全部策略，按 Type 索引。
func NewStrategies(d *StrategyDeps) map[string]LoginStrategy {
	list := []LoginStrategy{
		&PhoneOtpStrategy{d: d},
		&EmailOtpStrategy{d: d},
		&PasswordStrategy{d: d},
		&ThirdPartyStrategy{d: d, providers: d.Providers},
	}
	m := make(map[string]LoginStrategy, len(list))
	for _, s := range list {
		m[s.Type()] = s
	}
	return m
}

// ─── 手机验证码 ───────────────────────────────────────────────

type PhoneOtpStrategy struct{ d *StrategyDeps }

func (s *PhoneOtpStrategy) Type() string { return "phone_otp" }

func (s *PhoneOtpStrategy) VerifyCredential(ctx context.Context, in *LoginInput) (*User, bool, error) {
	e164, err := NormalizePhone(in.Nation, in.Phone)
	if err != nil {
		return nil, false, err
	}
	if verr := s.d.OTP.Verify(ctx, "phone", e164, in.Code); verr != nil {
		return nil, false, verr
	}
	u, uerr := s.d.Users.GetByPhone(ctx, e164)
	if uerr == nil {
		return u, false, nil
	} else if !IsNotFound(uerr) {
		return nil, false, uerr
	}
	u, created, err := s.d.Users.CreatePhoneUser(ctx, e164)
	if err != nil {
		return nil, false, err
	}
	return u, created, nil
}

// ─── 邮箱验证码 ───────────────────────────────────────────────

type EmailOtpStrategy struct{ d *StrategyDeps }

func (s *EmailOtpStrategy) Type() string { return "email_otp" }

func (s *EmailOtpStrategy) VerifyCredential(ctx context.Context, in *LoginInput) (*User, bool, error) {
	email, err := NormalizeEmail(in.Email)
	if err != nil {
		return nil, false, err
	}
	if verr := s.d.OTP.Verify(ctx, "email", email, in.Code); verr != nil {
		return nil, false, verr
	}
	u, uerr := s.d.Users.GetByEmail(ctx, email)
	if uerr == nil {
		return u, false, nil
	} else if !IsNotFound(uerr) {
		return nil, false, uerr
	}
	u, created, err := s.d.Users.CreateEmailUser(ctx, email)
	if err != nil {
		return nil, false, err
	}
	return u, created, nil
}

// ─── 口令 ─────────────────────────────────────────────────────

type PasswordStrategy struct{ d *StrategyDeps }

func (s *PasswordStrategy) Type() string { return "password" }

func (s *PasswordStrategy) VerifyCredential(ctx context.Context, in *LoginInput) (*User, bool, error) {
	ident, isEmail, err := normalizeIdentifier(in.Identifier)
	if err != nil {
		return nil, false, err
	}
	if locked, lerr := s.d.PwdGuard.Locked(ctx, ident); lerr != nil {
		return nil, false, lerr
	} else if locked {
		return nil, false, EAccountLocked()
	}
	// 账号不存在也跑等价耗时校验（dummy 哈希），抹平响应时序防枚举。
	phc, err := s.d.Credentials.GetPasswordHash(ctx, ident)
	if err != nil {
		if IsNotFound(err) {
			_ = s.d.Pepper.VerifyPassword(in.Password, s.d.Pepper.DummyHashPHC()) // 故意丢弃：仅取恒时耗时
			return nil, false, EInvalidCredentials()
		}
		return nil, false, err
	}
	if verr := s.d.Pepper.VerifyPassword(in.Password, phc); verr != nil {
		n, ferr := s.d.PwdGuard.Fail(ctx, ident, s.d.PwdCfg.MaxFails)
		if ferr != nil {
			return nil, false, ferr
		}
		if s.d.PwdCfg.MaxFails > 0 && n >= s.d.PwdCfg.MaxFails {
			return nil, false, EAccountLocked()
		}
		return nil, false, EInvalidCredentials()
	}
	var u *User
	if isEmail {
		u, err = s.d.Users.GetByEmail(ctx, ident)
	} else {
		u, err = s.d.Users.GetByPhone(ctx, ident)
	}
	if err != nil {
		if IsNotFound(err) {
			return nil, false, EInvalidCredentials() // 凭据在而账号不在：视为无效，不外泄
		}
		return nil, false, err
	}
	return u, false, nil
}

// normalizeIdentifier 口令凭据的 identifier：含 @ 视为邮箱（lower），否则须为 E.164。
func normalizeIdentifier(raw string) (ident string, isEmail bool, err error) {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "@") {
		e, eerr := NormalizeEmail(raw)
		return e, true, eerr
	}
	if !strings.HasPrefix(raw, "+") {
		return "", false, EBadRequest("phone identifier must be E.164")
	}
	return raw, false, nil
}

// ─── 第三方 ───────────────────────────────────────────────────

type ThirdPartyStrategy struct {
	d         *StrategyDeps
	providers ThirdPartyRegistry
}

func (s *ThirdPartyStrategy) Type() string { return "thirdparty" }

// NewThirdPartyStrategy 组装时注册 provider 表。
func NewThirdPartyStrategy(d *StrategyDeps, providers ThirdPartyRegistry) *ThirdPartyStrategy {
	return &ThirdPartyStrategy{d: d, providers: providers}
}

func (s *ThirdPartyStrategy) VerifyCredential(ctx context.Context, in *LoginInput) (*User, bool, error) {
	if s.providers == nil {
		return nil, false, EUnsupportedLoginType("no thirdparty provider registered")
	}
	prov, ok := s.providers.Get(in.ThirdParty.Provider)
	if !ok {
		return nil, false, EUnsupportedLoginType("unknown provider: " + in.ThirdParty.Provider)
	}
	ident, err := prov.ExchangeIdentity(ctx, in.ThirdParty)
	if err != nil {
		return nil, false, err
	}
	// ① 应用级查找键 (provider, appid, external_id) 命中 → 老身份，直接进。
	if row, ferr := s.d.ThirdParties.FindIdentity(ctx, ident.Provider, ident.AppID, ident.ExternalID); ferr == nil {
		_ = s.d.ThirdParties.TouchIdentityLastLogin(ctx, ident.Provider, ident.AppID, ident.ExternalID) // best-effort：失败不阻塞登录
		u, uerr := s.d.Users.GetByID(ctx, row.UserID)
		if uerr != nil {
			return nil, false, uerr
		}
		// 迟到的 subject_id：主体级绑定缺失则补插（绑开放平台后 unionid 首次出现）。
		if ident.SubjectID != "" {
			_, aerr := s.d.ThirdParties.FindAccount(ctx, ident.Provider, ident.SubjectID)
			if IsNotFound(aerr) {
				if cerr := s.d.ThirdParties.CreateAccount(ctx, row.UserID, ident.Provider, ident.SubjectID); cerr != nil && !IsSubjectConflict(cerr) {
					return nil, false, cerr
				}
			} else if aerr != nil {
				return nil, false, aerr
			}
		}
		return u, false, nil
	} else if !IsNotFound(ferr) {
		return nil, false, ferr
	}
	// ② 未命中、带 subject_id → 主体级归并：同一人多端收敛到同一本地账号。
	if ident.SubjectID != "" {
		if acc, aerr := s.d.ThirdParties.FindAccount(ctx, ident.Provider, ident.SubjectID); aerr == nil {
			created, cerr := s.d.ThirdParties.CreateIdentity(ctx, acc.UserID, ident)
			if cerr != nil {
				return nil, false, cerr
			}
			_ = created // 并发补插失败即对方已插，回查由调用方下一次登录自然收敛
			u, uerr := s.d.Users.GetByID(ctx, acc.UserID)
			if uerr != nil {
				return nil, false, uerr
			}
			return u, false, nil
		} else if !IsNotFound(aerr) {
			return nil, false, aerr
		}
	}
	// ③ 全 miss → 建号 + 主体级绑定 + 应用级身份，同一事务。
	u, created, err := s.d.ThirdParties.CreateLinkedUser(ctx, ident)
	if err != nil {
		return nil, false, err
	}
	return u, created, nil
}
