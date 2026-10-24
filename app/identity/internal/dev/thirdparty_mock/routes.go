package thirdparty_mock

import (
	"log/slog"
	"net/http"

	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// RegisterRoutes 把 mock 授权页与确认端点挂到 identity 的 HTTP 服务上（与业务同端口、同地址）。
// 仅开发/测试用：真实平台对接后整个 dev/ 目录随 build tag 排除生产构建。。
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

	// 确认授权：签发一次性 code → 302 回 identity 的 callback（浏览器流）；
	// 同时返回 JSON {code, redirect}（脚本流：一步模拟取 code 后直接调统一 Login）。
	r.POST("/confirm", func(c khttp.Context) error {
		state := c.Request().PostFormValue("state")
		if state == "" {
			return c.String(http.StatusBadRequest, "missing state")
		}
		code, err := p.Confirm(c, state)
		if err != nil {
			return c.String(http.StatusBadRequest, err.Error())
		}
		redirect := p.CallbackRedirect(code, state)
		c.Response().Header().Set("Location", redirect)
		return c.JSON(http.StatusFound, map[string]string{"code": code, "redirect": redirect})
	})
}
