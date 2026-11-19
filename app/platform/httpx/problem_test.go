package httpx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	kerrors "github.com/go-kratos/kratos/v3/errors"
)

// 超时必须映射成可重试的 504，而不是混进 500 + 空 code。
func TestProblemEncoderMapsDeadlineExceeded(t *testing.T) {
	// 包一层 %w：真实链路里超时会经仓储/服务层包装后才到这里。
	err := fmt.Errorf("login: %w", context.DeadlineExceeded)

	w := httptest.NewRecorder()
	ProblemEncoder()(w, httptest.NewRequest(http.MethodPost, "/v1/auth/otp:send", nil), err)

	if w.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("content-type = %q", ct)
	}
	var body map[string]any
	if dErr := json.Unmarshal(w.Body.Bytes(), &body); dErr != nil {
		t.Fatalf("decode body: %v", dErr)
	}
	if body["code"] != ReasonTimeout {
		t.Fatalf("code = %v, want %s", body["code"], ReasonTimeout)
	}
	if body["retryable"] != "true" {
		t.Fatalf("retryable = %v, want true", body["retryable"])
	}
	// 内部实现细节不能回给客户端。
	if detail, _ := body["detail"].(string); detail == "" || detail == context.DeadlineExceeded.Error() {
		t.Fatalf("detail leaks internal error: %q", detail)
	}
}

// 业务错误仍按 kratos 错误码输出，不受超时分支影响。
func TestProblemEncoderKeepsBusinessError(t *testing.T) {
	err := kerrors.New(http.StatusTooManyRequests, "IAM_OTP_SEND_TOO_FREQUENT", "60s 内重复发码").
		WithMetadata(map[string]string{"retryable": "true"})

	w := httptest.NewRecorder()
	ProblemEncoder()(w, httptest.NewRequest(http.MethodPost, "/v1/auth/otp:send", nil), err)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", w.Code)
	}
	var body map[string]any
	if dErr := json.Unmarshal(w.Body.Bytes(), &body); dErr != nil {
		t.Fatalf("decode body: %v", dErr)
	}
	if body["code"] != "IAM_OTP_SEND_TOO_FREQUENT" {
		t.Fatalf("code = %v", body["code"])
	}
}
