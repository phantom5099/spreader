package thirdparty_mock

import (
	"log/slog"
	"net/http"

	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// RegisterRoutes 把 mock 平台的授权端点挂到 identity 的 HTTP 服务上（与业务同端口、同地址）。
//
// 定位：开发期的本地假平台。只复刻真实平台对外的两个行为——返回授权页、接收授权请求后签发
// 一次性 code 并回跳（302）。它不参与业务装配：不经 login.ThirdPartyProvider 调用，
// 而 Provider 实现的接口方法只用于「code → 身份」的兑换。
//
// 生产隔离靠运行期双闸，不靠 build tag：buildProviders 在 production 或
// allow_insecure_providers=false 时使 mockProvider 为 nil，App.registerDev 随之不装配，
// 本函数根本不会被调用。
func RegisterRoutes(r *khttp.Router, p *Provider, log *slog.Logger) {
	r.GET("/authorize", func(c khttp.Context) error {
		state := c.Request().URL.Query().Get("state")
		if state == "" {
			return c.String(http.StatusBadRequest, "missing state")
		}
		return c.Blob(http.StatusOK, "text/html; charset=utf-8", []byte(`<!doctype html>
<html><head><meta charset="utf-8"><title>Mock 授权页</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:60px auto">
  <h3>Mock 第三方授权（`+ProviderName+`）</h3>
  <p>开发期模拟的第三方授权页。点击「同意」即完成授权并签发一次性 code。</p>
  <form method="post" action="/mock/oauth/confirm">
    <input type="hidden" name="state" value="`+state+`">
    <button type="submit">同意</button>
  </form>
</body></html>`))
	})

	// 接收授权请求 → 签发一次性 code → 302 回 identity 的 callback。这是真实平台的对外行为：
	// 只回跳转，code 在 Location 里，不额外附 JSON body。
	r.POST("/confirm", func(c khttp.Context) error {
		state := c.Request().PostFormValue("state")
		if state == "" {
			return c.String(http.StatusBadRequest, "missing state")
		}
		code, err := p.IssueCode(c, state)
		if err != nil {
			return c.String(http.StatusBadRequest, err.Error())
		}
		c.Response().Header().Set("Location", p.CallbackRedirect(code, state))
		return c.String(http.StatusFound, "")
	})
}
