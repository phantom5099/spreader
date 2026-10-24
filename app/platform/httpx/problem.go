package httpx

import (
	"encoding/json"
	"net/http"

	kerrors "github.com/go-kratos/kratos/v3/errors"
	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// ProblemEncoder 按 RFC 9457 输出 application/problem+json：
// 业务码放扩展成员 code，retryable / challenge 一并作为扩展成员。
func ProblemEncoder() khttp.EncodeErrorFunc {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		se := kerrors.FromError(err)
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(int(se.Code))
		body := map[string]any{
			"type":   "about:blank",
			"title":  http.StatusText(int(se.Code)),
			"status": se.Code,
			"code":   se.Reason,
			"detail": se.Message,
		}
		for k, v := range se.Metadata {
			if k == "challenge" {
				body[k] = json.RawMessage(v) // 挑战对象原样嵌入
				continue
			}
			body[k] = v
		}
		_ = json.NewEncoder(w).Encode(body)
	}
}
