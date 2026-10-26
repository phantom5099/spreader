// Package thirdparty_mock mock 第三方平台（wechat_mock）：本地全流程模拟。
// 与真实 provider 同构复刻标准授权码流程；生产双闸禁用（env!=production && allow_insecure_providers）。
package thirdparty_mock

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// ProviderName mock 命名空间：与未来任何真实平台账号在身份表中永不相撞。
const ProviderName = "wechat_mock"

// Config mock 参数。
type Config struct {
	AppID          string   // 固定 mock appid
	ExternalIDPool []string // 空=每次授权随机派生 mock_ 前缀身份；非空=池内确定分配（可重复测试）
	PublicBaseURL  string   // mock 授权页对外地址（独立 dev HTTP 端点）
	CallbackURL    string   // identity 服务的 /v1/auth/thirdparty/callback
}

// Provider 实现 login.ThirdPartyProvider。
type Provider struct {
	cfg   Config
	store login.ThirdPartyStore
}

// New 构建。
func New(cfg Config, store login.ThirdPartyStore) *Provider {
	return &Provider{cfg: cfg, store: store}
}

// Provider 实现 login.ThirdPartyProvider。
func (p *Provider) Provider() string { return ProviderName }

// AuthorizeURL 实现 login.ThirdPartyProvider：state 由服务端签发后随 URL 携带。
func (p *Provider) AuthorizeURL(_ context.Context, state, _ string) (string, error) {
	u, err := url.Parse(p.cfg.PublicBaseURL + "/mock/oauth/authorize")
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("state", state)
	q.Set("provider", ProviderName)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// ExchangeIdentity 实现 login.ThirdPartyProvider：服务端只信自己派发的 code（原子消费）。
// 客户端只能传 code/state，永远不能传身份标识——mock 也不开「指定身份登录」的后门。
func (p *Provider) ExchangeIdentity(ctx context.Context, cred login.ThirdPartyCredential) (*login.ThirdPartyIdentity, error) {
	payload, err := p.store.ConsumeCode(ctx, cred.Code)
	if err != nil {
		return nil, login.EThirdPartyAuthFailed("code 过期/已消费")
	}
	if payload.Provider != cred.Provider {
		return nil, login.EThirdPartyAuthFailed("provider mismatch")
	}
	return &login.ThirdPartyIdentity{
		Provider:   payload.Provider,
		AppID:      payload.AppID,
		ExternalID: payload.ExternalID,
		SubjectID:  payload.SubjectID,
		Nickname:   payload.Nickname,
		AvatarURL:  payload.AvatarURL,
	}, nil
}

// IssueCode mock 平台收到授权请求后的应答：签发一次性 code，绑定本次授权的模拟身份。
//
// 语义边界：这里是「假平台接收请求 → 返回结果」，与真实平台处理同意的对外行为一致。
// 它不属于 login.ThirdPartyProvider —— 真实平台没有「服务端代用户同意」的入口，
// 授权动作发生在用户浏览器里（见 RegisterRoutes 授权页的表单提交）。
func (p *Provider) IssueCode(ctx context.Context, state string) (string, error) {
	if state == "" {
		return "", login.EOauthStateInvalid()
	}
	ident := p.deriveIdentity(state)
	code := randomHex(16)
	if err := p.store.SaveCode(ctx, code, &login.ThirdPartyCodePayload{
		Provider:   ProviderName,
		AppID:      ident.AppID,
		ExternalID: ident.ExternalID,
		SubjectID:  ident.SubjectID,
		Nickname:   ident.Nickname,
		AvatarURL:  ident.AvatarURL,
	}, 120); err != nil {
		return "", err
	}
	return code, nil
}

// deriveIdentity 派生并固定模拟身份：池非空取池内确定分配；否则随机派生 mock_ 前缀。
// subject_id（模拟 unionid）与 external_id 同源派生：同一次「用户」在多端授权可稳定归并。
func (p *Provider) deriveIdentity(state string) login.ThirdPartyIdentity {
	if len(p.cfg.ExternalIDPool) > 0 {
		idx := fnv32(state) % uint32(len(p.cfg.ExternalIDPool))
		ext := p.cfg.ExternalIDPool[idx]
		sub := "mock_unionid_" + ext
		return login.ThirdPartyIdentity{
			Provider: ProviderName, AppID: p.cfg.AppID,
			ExternalID: ext, SubjectID: sub,
			Nickname: "Mock用户", AvatarURL: "https://mock.example/avatar/" + ext + ".png",
		}
	}
	suffix := randomHex(8)
	return login.ThirdPartyIdentity{
		Provider: ProviderName, AppID: p.cfg.AppID,
		ExternalID: "mock_openid_" + suffix, SubjectID: "mock_unionid_" + suffix,
		Nickname: "Mock用户", AvatarURL: "https://mock.example/avatar/" + suffix + ".png",
	}
}

// CallbackRedirect 授权完成后浏览器应跳转的回跳地址（携 code + state）。
func (p *Provider) CallbackRedirect(code, state string) string {
	return fmt.Sprintf("%s?code=%s&state=%s", p.cfg.CallbackURL,
		url.QueryEscape(code), url.QueryEscape(state))
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func fnv32(s string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}
