package thirdparty_mock

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// RegisterRoutes 在独立的 dev HTTP 端点上挂载 mock 授权页与确认端点。
// 授权页 HTML 仅开发/测试用：真实平台对接后整个 dev/ 目录随 build tag 排除生产构建。
func RegisterRoutes(mux *http.ServeMux, p *Provider, log *slog.Logger) {
	mux.HandleFunc("GET /mock/oauth/authorize", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		if state == "" {
			http.Error(w, "missing state", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html>
<html><head><meta charset="utf-8"><title>Mock 授权页</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:60px auto">
  <h3>Mock 第三方授权（` + ProviderName + `）</h3>
  <p>开发期模拟的第三方授权页。点击「同意」即完成授权并签发一次性 code。</p>
  <form method="post" action="/mock/oauth/confirm">
    <input type="hidden" name="state" value="` + state + `">
    <button type="submit">同意</button>
  </form>
</body></html>`))
	})

	// 确认授权：签发一次性 code → 302 回 identity 的 callback（浏览器流）；
	// 同时返回 JSON {code, redirect}（脚本流：一步模拟取 code 后直接调统一 Login）。
	mux.HandleFunc("POST /mock/oauth/confirm", func(w http.ResponseWriter, r *http.Request) {
		state := r.PostFormValue("state")
		if state == "" {
			http.Error(w, "missing state", http.StatusBadRequest)
			return
		}
		code, err := p.Confirm(r.Context(), state)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		redirect := p.CallbackRedirect(code, state)
		w.Header().Set("Location", redirect)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "redirect": redirect})
		log.Info("mock oauth confirm", "state", state)
	})
}
