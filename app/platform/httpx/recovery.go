// Package httpx 进程级 HTTP 横切设施：panic 兜底与 problem+json 错误编码。
// 这些设施走 net/http 层（khttp.Filter），而不是 kratos 的 ctx.Middleware 链——
// 手写路由不经过生成的 handler，ctx.Middleware 对它们不生效。
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
)

// Recovery panic 兜底：把「进程退出」降级为「单个请求 500」。
// 只捕获当前 goroutine；handler 里另起的 goroutine 不受保护。
func Recovery(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}
				// 标准库约定：ErrAbortHandler 是主动中止（如连接被劫持），不记录不响应。
				if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(rec)
				}
				log.Error("panic recovered",
					"panic", fmt.Sprint(rec),
					"method", r.Method,
					"path", r.URL.Path,
					"stack", string(debug.Stack()),
				)
				w.Header().Set("Content-Type", "application/problem+json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"type":   "about:blank",
					"title":  http.StatusText(http.StatusInternalServerError),
					"status": http.StatusInternalServerError,
					"code":   "INTERNAL",
					"detail": "internal server error",
				})
			}()
			next.ServeHTTP(w, r)
		})
	}
}
