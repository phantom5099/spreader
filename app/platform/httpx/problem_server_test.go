package httpx

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// 装配级验证：请求预算到期后，handler 拿到的 ctx 必须已被取消，且错误最终编码成可重试的 504。
// 这条测试同时锁住两件事——khttp.Timeout 真的生效（否则 c.Err() 为 nil 会返回 200），
// 以及超时错误确实走 ProblemEncoder 的专用分支。
func TestServerTimeoutBecomesGatewayTimeout(t *testing.T) {
	const budget = 50 * time.Millisecond
	srv := khttp.NewServer(
		khttp.Timeout(budget),
		khttp.ErrorEncoder(ProblemEncoder()),
	)
	srv.Route("").GET("/slow", func(c khttp.Context) error {
		time.Sleep(3 * budget) // 模拟慢依赖：耗时超过请求预算
		return c.Err()         // 预算耗尽后 ctx.Err() 非 nil，交给 ErrorEncoder
	})

	ts := httptest.NewServer(srv.Handler)
	defer ts.Close()

	resp, err := ts.Client().Get(ts.URL + "/slow")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != StatusTimeout {
		t.Fatalf("status = %d, want %d", resp.StatusCode, StatusTimeout)
	}
	var body map[string]any
	if dErr := json.NewDecoder(resp.Body).Decode(&body); dErr != nil {
		t.Fatalf("decode body: %v", dErr)
	}
	if body["code"] != ReasonTimeout {
		t.Fatalf("code = %v, want %s", body["code"], ReasonTimeout)
	}
}
