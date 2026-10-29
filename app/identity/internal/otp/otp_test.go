package otp

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// fakeStore otp 域自声明接口的测试替身。
type fakeStore struct {
	kv map[string]entry
}

type entry struct {
	val string
	ttl int64
}

func newFakeStore() *fakeStore { return &fakeStore{kv: map[string]entry{}} }

func (f *fakeStore) SaveCode(_ context.Context, key, val string, ttl int64) error {
	f.kv[key] = entry{val: val, ttl: ttl}
	return nil
}

func (f *fakeStore) GetCode(_ context.Context, key string) (string, error) {
	e, ok := f.kv[key]
	if !ok {
		return "", errors.New("not found")
	}
	return e.val, nil
}

func (f *fakeStore) DeleteCode(_ context.Context, key string) error {
	delete(f.kv, key)
	return nil
}

func (f *fakeStore) ConsumeIfMatch(_ context.Context, key, expect string) (bool, error) {
	e, ok := f.kv[key]
	if !ok || e.val != expect {
		return false, nil
	}
	delete(f.kv, key)
	return true, nil
}

func (f *fakeStore) Incr(_ context.Context, key string, ttl int64) (int64, error) {
	e, ok := f.kv[key]
	if !ok {
		f.kv[key] = entry{val: "1", ttl: ttl}
		return 1, nil
	}
	e.ttl = ttl
	f.kv[key] = e
	var n int64
	for _, c := range e.val {
		n = n*10 + int64(c-'0')
	}
	n++
	f.kv[key] = entry{val: itoa(n), ttl: ttl}
	return n, nil
}

func (f *fakeStore) RemainingTTL(_ context.Context, key string) (int64, error) {
	e, ok := f.kv[key]
	if !ok {
		return 0, nil
	}
	return e.ttl, nil
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

type fakeSender struct {
	sent []string
	fail bool
}

func (s *fakeSender) Send(_ context.Context, to, code string) error {
	if s.fail {
		return context.DeadlineExceeded
	}
	s.sent = append(s.sent, to+"|"+code)
	return nil
}

func newTestService() (*Service, *fakeStore, *fakeSender, *fakeSender) {
	store := newFakeStore()
	primary := &fakeSender{}
	fallback := &fakeSender{}
	svc := NewService(store, NewRouter(map[string][]Sender{
		"phone": {primary, fallback},
	}), Config{
		TTLSeconds: 300, CodeLength: 6, CooldownSeconds: 60,
		DailyLimit: 5, PerIPPerHour: 100, PerDevicePerHour: 100,
		GlobalPerMinute: 1000, Pepper: "test-pepper",
	}, nil)
	return svc, store, primary, fallback
}

func TestSendAndVerify(t *testing.T) {
	svc, store, primary, _ := newTestService()
	ctx := context.Background()
	cd, err := svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "1.2.3.4", "dev-1")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if cd != 60 {
		t.Fatalf("cooldown = %d", cd)
	}
	if len(primary.sent) != 1 {
		t.Fatalf("primary sender should be used once, got %d", len(primary.sent))
	}
	code := strings.Split(primary.sent[0], "|")[1]
	if len(code) != 6 {
		t.Fatalf("code length = %d", len(code))
	}
	// 正确验证一次性消费。
	if err := svc.Verify(ctx, "phone", "+8613800138000", code); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if err := svc.Verify(ctx, "phone", "+8613800138000", code); err == nil {
		t.Fatal("code must be single-use")
	}
	_ = store
}

func TestCooldown(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()
	if _, err := svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "", ""); err != nil {
		t.Fatalf("first send: %v", err)
	}
	_, err := svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "", "")
	if err == nil {
		t.Fatal("second send within cooldown must fail")
	}
	var e *login.Error
	if !errors.As(err, &e) || e.Reason != "IAM_OTP_SEND_TOO_FREQUENT" {
		t.Fatalf("want OTP_SEND_TOO_FREQUENT, got %v", err)
	}
}

func TestFallbackChannel(t *testing.T) {
	svc, _, primary, fallback := newTestService()
	primary.fail = true
	ctx := context.Background()
	if _, err := svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "", ""); err != nil {
		t.Fatalf("fallback send: %v", err)
	}
	if len(fallback.sent) != 1 {
		t.Fatal("fallback should be used when primary fails")
	}
}

func TestWrongCodeInvalid(t *testing.T) {
	svc, _, primary, _ := newTestService()
	ctx := context.Background()
	_, _ = svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "", "")
	code := strings.Split(primary.sent[0], "|")[1]
	wrong := code
	for wrong == code {
		wrong = "000000"
	}
	verr := svc.Verify(ctx, "phone", "+8613800138000", wrong)
	if verr == nil {
		t.Fatal("wrong code must fail")
	}
	var ce *login.Error
	if !errors.As(verr, &ce) || ce.Reason != "IAM_OTP_INVALID" {
		t.Fatalf("want OTP_INVALID (合并错误码防枚举), got %v", verr)
	}
	// 正确码不受错误尝试影响（未达上限）。
	if err := svc.Verify(ctx, "phone", "+8613800138000", code); err != nil {
		t.Fatalf("correct code after wrong attempts: %v", err)
	}
}

// 登录码的键带 scene 前缀：这是「一个码跨流程复用」的唯一隔离点。
// 断言键名而非行为，因为键布局本身就是跨进程契约（重放检测、运维排障都按它查）。
func TestLoginCodeKeyIsSceneNamespaced(t *testing.T) {
	svc, store, primary, _ := newTestService()
	ctx := context.Background()
	if _, err := svc.Send(ctx, "phone", "+8613800138000", login.OTPSceneLogin, "", ""); err != nil {
		t.Fatalf("send: %v", err)
	}
	want := "iam:otp:code:login:phone:+8613800138000"
	if _, ok := store.kv[want]; !ok {
		keys := make([]string, 0, len(store.kv))
		for k := range store.kv {
			keys = append(keys, k)
		}
		t.Fatalf("期望键 %q 不存在，实际键：%v", want, keys)
	}
	code := strings.Split(primary.sent[0], "|")[1]
	if err := svc.Verify(ctx, "phone", "+8613800138000", code); err != nil {
		t.Fatalf("verify: %v", err)
	}
}
