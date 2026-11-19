package login

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "github.com/go-kratos/kratos/v3/encoding/json" // 注册 application/json codec
	khttp "github.com/go-kratos/kratos/v3/transport/http"
)

// stubUsers / stubVerifier 只让 Handler 的非 nil 依赖成立，不参与断言。
type stubUsers struct{}

func (stubUsers) GetByID(context.Context, string) (*User, error) {
	return &User{ID: "u-1", Status: UserStatusActive}, nil
}
func (stubUsers) GetByPhone(context.Context, string) (*User, error) { return nil, nil }
func (stubUsers) GetByEmail(context.Context, string) (*User, error) { return nil, nil }
func (stubUsers) CreatePhoneUser(context.Context, string) (*User, bool, error) {
	return nil, false, nil
}
func (stubUsers) CreateEmailUser(context.Context, string) (*User, bool, error) {
	return nil, false, nil
}

type stubVerifier struct{}

func (stubVerifier) Kind() CaptchaKind { return "stub" }
func (stubVerifier) Issue(context.Context, *ChallengeRequest) (*Challenge, error) {
	return &Challenge{ChallengeID: "c-1", Kind: "text", Payload: []byte("p"), ExpiresAt: time.Now().Add(time.Minute).Unix()}, nil
}
func (stubVerifier) Verify(context.Context, *ChallengeResponse) (*ChallengeResult, error) {
	return &ChallengeResult{Passed: true}, nil
}

// newMux 按生产路由表注册全部端点，供契约与可达性断言使用。
// 本地兜 panic：个别端点依赖未装配时会 panic，不应中断其它用例。
func newMux(h *loginHarness) *khttp.Server {
	srv := khttp.NewServer(khttp.Filter(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					w.WriteHeader(http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}))
	handler := NewHandler(h.svc, stubUsers{}, h.sessions, stubVerifier{})
	r := srv.Route("/v1")
	r.POST("/auth/otp:send", handler.SendOtp)
	r.POST("/auth/login", handler.Login)
	r.POST("/auth/captcha:issue", handler.IssueCaptcha)
	r.POST("/auth/token:refresh", handler.RefreshToken)
	r.DELETE("/auth/session", handler.Logout)
	r.GET("/me", handler.GetMe)
	r.GET("/auth/thirdparty/authorize", handler.ThirdPartyAuthorize)
	r.GET("/auth/thirdparty/callback", handler.ThirdPartyCallback)
	return srv
}

func do(srv *khttp.Server, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func postJSON(t *testing.T, srv *khttp.Server, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return do(srv, http.MethodPost, path, body)
}

// 路由表本身就是对外契约：路径与方法错一个，客户端就静默 404。
func TestRoutesRegistered(t *testing.T) {
	srv := newMux(newLoginHarness())
	cases := []struct{ method, path, body string }{
		{http.MethodPost, "/v1/auth/otp:send", `{}`},
		{http.MethodPost, "/v1/auth/login", `{"type":"LOGIN_TYPE_PHONE_OTP","phone_otp":{"nation":"+86","phone":"13800000000","code":"1"}}`},
		{http.MethodPost, "/v1/auth/captcha:issue", `{}`},
		{http.MethodPost, "/v1/auth/token:refresh", `{"refresh_token":"rt"}`},
		{http.MethodDelete, "/v1/auth/session", ""},
		{http.MethodGet, "/v1/me", ""},
		{http.MethodGet, "/v1/auth/thirdparty/authorize", ""},
		{http.MethodGet, "/v1/auth/thirdparty/callback", ""},
	}
	for _, c := range cases {
		w := do(srv, c.method, c.path, c.body)
		if w.Code == http.StatusNotFound || w.Code == http.StatusMethodNotAllowed {
			t.Errorf("%s %s 未注册（%d）", c.method, c.path, w.Code)
		}
	}

	// 反向校验：路由器确实会拒绝不存在的路径，否则上面的断言全是假通过。
	// 注意 kratos 把 MethodNotAllowedHandler 指向 DefaultServeMux，方法写错也表现为 404。
	if w := do(srv, http.MethodGet, "/v1/not-registered", ""); w.Code != http.StatusNotFound {
		t.Errorf("未注册路径 = %d, want 404", w.Code)
	}
}

// 传输字段名是对外契约：snake_case，且不含驼峰泄漏。
func TestLoginEndpointFieldNames(t *testing.T) {
	h := newLoginHarness()
	h.strategy.isNew = true
	w := postJSON(t, newMux(h), "/v1/auth/login",
		`{"type":"LOGIN_TYPE_PHONE_OTP","phone_otp":{"nation":"+86","phone":"13800000000","code":"123456"}}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body: %v (%s)", err, w.Body.String())
	}
	for _, field := range []string{"user", "is_new_user", "onboarding_required", "access_token", "refresh_token", "expires_in", "token_type"} {
		if _, ok := got[field]; !ok {
			t.Fatalf("missing field %q in %s", field, w.Body.String())
		}
	}
	if _, leaked := got["isNewUser"]; leaked {
		t.Fatalf("camelCase field leaked into the contract: %s", w.Body.String())
	}
	// 64 位整型必须是数字而不是字符串。
	if _, isString := got["expires_in"].(string); isString {
		t.Fatalf("expires_in must be a number, got string: %s", w.Body.String())
	}
}

func TestLoginEndpointRejectsMissingCredential(t *testing.T) {
	h := newLoginHarness()
	w := postJSON(t, newMux(h), "/v1/auth/login", `{"type":"LOGIN_TYPE_PHONE_OTP"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", w.Code, w.Body.String())
	}
	if h.sessions.issued != 0 {
		t.Fatalf("must not issue a session, issued=%d", h.sessions.issued)
	}
}

func TestLoginEndpointRejectsMalformedBody(t *testing.T) {
	h := newLoginHarness()
	w := postJSON(t, newMux(h), "/v1/auth/login", `{"type":`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", w.Code, w.Body.String())
	}
	if h.sessions.issued != 0 {
		t.Fatalf("must not issue a session, issued=%d", h.sessions.issued)
	}
}
