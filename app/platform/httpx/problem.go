package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	kerrors "github.com/go-kratos/kratos/v3/errors"
	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// 超时的 problem 形状：非业务错误，但必须让客户端区分「可重试」与「真失败」。
const (
	StatusTimeout = http.StatusGatewayTimeout
	ReasonTimeout = "IAM_TIMEOUT"
	timeoutDetail = "请求处理超时，请重试"
)

// ProblemEncoder 按 RFC 9457 输出 application/problem+json：
// 业务码放扩展成员 code，retryable / challenge 一并作为扩展成员。
func ProblemEncoder() khttp.EncodeErrorFunc {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		// 超时（含被 %w 包装过的）必须单独映射。走 kerrors.FromError 只会得到 500 + 空 code：
		// 客户端无法判断是否该重试，而且 se.Message 会把 "context deadline exceeded" 原样回给前端。
		if errors.Is(err, context.DeadlineExceeded) {
			encodeProblem(w, StatusTimeout, ReasonTimeout, timeoutDetail,
				map[string]string{"retryable": "true"})
			return
		}
		se := kerrors.FromError(err)
		encodeProblem(w, int(se.Code), se.Reason, se.Message, se.Metadata)
	}
}

// encodeProblem 写 problem+json 响应体；challenge 原样嵌入，其余元数据平铺为扩展成员。
func encodeProblem(w http.ResponseWriter, status int, code, detail string, meta map[string]string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	body := map[string]any{
		"type":   "about:blank",
		"title":  http.StatusText(status),
		"status": status,
		"code":   code,
		"detail": detail,
	}
	for k, v := range meta {
		if k == "challenge" {
			body[k] = json.RawMessage(v) // 挑战对象原样嵌入
			continue
		}
		body[k] = v
	}
	_ = json.NewEncoder(w).Encode(body)
}
