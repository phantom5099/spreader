package login

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
)

func TestHashVerifyPassword(t *testing.T) {
	p := Pepper("unit-pepper")
	phc, err := p.HashPassword("s3cret-Password!")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := p.VerifyPassword("s3cret-Password!", phc); err != nil {
		t.Fatalf("verify correct: %v", err)
	}
	if err := p.VerifyPassword("wrong", phc); !IsMismatch(err) {
		t.Fatalf("want mismatch, got %v", err)
	}
	// dummy 哈希与任意口令不匹配（仅耗时垫底）。
	if err := p.VerifyPassword("anything", p.DummyHashPHC()); !IsMismatch(err) {
		t.Fatalf("dummy should never match, got %v", err)
	}
}

func TestNormalizePhone(t *testing.T) {
	cases := []struct {
		nation, raw, want string
		wantErr           bool
	}{
		{"CN", "13800138000", "+8613800138000", false},
		{"CN", "138 0013-8000", "+8613800138000", false}, // 异形输入归一
		{"US", "4155551234", "+14155551234", false},
		{"GB", "07911 123456", "+447911123456", false}, // 干线前缀 0 必须剥掉（libphonenumber）
		{"CN", "01012345678", "+861012345678", false},  // CN 固话带区号前缀 0 同理
		{"XX", "123", "", true},
		{"CN", "", "", true},
		{"CN", "123", "", true},        // 过短：parse/模式校验拒绝（手写版会产出 +86123）
		{"CN", "1234567890", "", true}, // 形状合法但模式无效（库裁决 invalid；手写版会放行）
	}
	for _, c := range cases {
		got, err := NormalizePhone(c.nation, c.raw)
		if c.wantErr {
			if err == nil {
				t.Fatalf("NormalizePhone(%s,%s) want err", c.nation, c.raw)
			}
			continue
		}
		if err != nil {
			t.Fatalf("NormalizePhone(%s,%s): %v", c.nation, c.raw, err)
		}
		if got != c.want {
			t.Fatalf("NormalizePhone(%s,%s)=%s want %s", c.nation, c.raw, got, c.want)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got, _ := NormalizeEmail("  A@B.COM "); got != "a@b.com" {
		t.Fatalf("lower normalize: %s", got)
	}
	for _, bad := range []string{"no-at", "@b.com", "a@", "a@@b.com", "a b@c.com"} {
		if _, err := NormalizeEmail(bad); err == nil {
			t.Fatalf("NormalizeEmail(%q) want err", bad)
		}
	}
}

func TestMaskIdentifier(t *testing.T) {
	// E.164 含国家码：掩码作用于全部数字（861****8000），仍不可复原。
	if got := MaskIdentifier("+8613800138000"); got != "861****8000" {
		t.Fatalf("phone mask: %s", got)
	}
	if got := MaskIdentifier("ab@cd.com"); got != "ab***@cd.com" {
		t.Fatalf("email mask: %s", got)
	}
	if got := MaskIdentifier("a@b.com"); got != "a***@b.com" {
		t.Fatalf("short email mask: %s", got)
	}
}

// ─── 登录编排：Events 是唯一可测接缝，断言"哪个分支发哪个事件、有没有签发令牌" ───

type fakeStrategy struct {
	user  *User
	isNew bool
	err   error
}

func (f *fakeStrategy) Type() string { return "fake" }

func (f *fakeStrategy) VerifyCredential(context.Context, *LoginInput) (*User, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	return f.user, f.isNew, nil
}

type fakeEvents struct {
	created   []string
	succeeded []*LoginEvent
	failed    []*LoginEvent
}

func (f *fakeEvents) UserCreated(_ context.Context, userID string) {
	f.created = append(f.created, userID)
}

func (f *fakeEvents) LoginSucceeded(_ context.Context, e *LoginEvent) {
	f.succeeded = append(f.succeeded, e)
}

func (f *fakeEvents) LoginFailed(_ context.Context, e *LoginEvent) {
	f.failed = append(f.failed, e)
}

func (f *fakeEvents) SessionRevoked(context.Context, string, string, string, string) {}

// fakePolicy 恒不触发人机校验：编排用例与验证码策略无关。
type fakePolicy struct{}

func (fakePolicy) Evaluate(context.Context, SceneContext) (bool, error) { return false, nil }

type fakeSessions struct{ issued int }

func (f *fakeSessions) Issue(context.Context, string, int64, string, string) (string, string, int64, error) {
	f.issued++
	return "access", "refresh", 900, nil
}

func (f *fakeSessions) Refresh(context.Context, string, string) (string, string, int64, string, error) {
	return "", "", 0, "", nil
}

func (f *fakeSessions) Revoke(context.Context, AuthInfo) error { return nil }

func (f *fakeSessions) Authenticate(context.Context, string) (*AuthInfo, error) { return nil, nil }

type loginHarness struct {
	svc      *Service
	strategy *fakeStrategy
	sessions *fakeSessions
	events   *fakeEvents
}

func newLoginHarness() *loginHarness {
	st := &fakeStrategy{user: &User{ID: "u-1", Status: UserStatusActive}}
	sess := &fakeSessions{}
	ev := &fakeEvents{}
	return &loginHarness{
		svc: NewService(Deps{
			Strategies: map[string]LoginStrategy{"fake": st},
			Sessions:   sess,
			Events:     ev,
			Policy:     fakePolicy{},
			Log:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		}),
		strategy: st,
		sessions: sess,
		events:   ev,
	}
}

func (h *loginHarness) login() (*AuthResult, error) {
	return h.svc.Login(context.Background(), &LoginInput{Type: "fake", Phone: "+8613800000000"})
}

func TestLoginBannedUserIssuesNoToken(t *testing.T) {
	h := newLoginHarness()
	h.strategy.user = &User{ID: "u-1", Status: UserStatusBanned}

	res, err := h.login()
	if res != nil {
		t.Fatalf("banned login returned result: %+v", res)
	}
	var e *Error
	if !errors.As(err, &e) || e.Reason != EAccountBanned().Reason {
		t.Fatalf("want account banned, got %v", err)
	}
	if h.sessions.issued != 0 {
		t.Fatalf("banned user must not get a session, issued=%d", h.sessions.issued)
	}
	if len(h.events.succeeded) != 0 || len(h.events.failed) != 1 {
		t.Fatalf("want failed=1 succeeded=0, got failed=%d succeeded=%d",
			len(h.events.failed), len(h.events.succeeded))
	}
	if got := h.events.failed[0].Reason; got != "banned" {
		t.Fatalf("want reason banned, got %q", got)
	}
}

func TestLoginCredentialFailureIsRecorded(t *testing.T) {
	h := newLoginHarness()
	h.strategy.err = errors.New("bad credential")

	if _, err := h.login(); err == nil {
		t.Fatal("want error")
	}
	if h.sessions.issued != 0 {
		t.Fatalf("failed login must not issue session, issued=%d", h.sessions.issued)
	}
	if len(h.events.failed) != 1 || h.events.failed[0].Result != "failed" {
		t.Fatalf("failed login must leave one failed audit event, got %+v", h.events.failed)
	}
}

func TestLoginNewUserEmitsCreatedAndSucceeded(t *testing.T) {
	h := newLoginHarness()
	h.strategy.isNew = true

	res, err := h.login()
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if !res.IsNewUser || res.AccessToken == "" {
		t.Fatalf("want new user with token, got %+v", res)
	}
	if len(h.events.created) != 1 || h.events.created[0] != "u-1" {
		t.Fatalf("want one user.created for u-1, got %v", h.events.created)
	}
	if len(h.events.succeeded) != 1 {
		t.Fatalf("want one login.succeeded, got %d", len(h.events.succeeded))
	}
}

func TestLoginExistingUserSkipsCreated(t *testing.T) {
	h := newLoginHarness()

	if _, err := h.login(); err != nil {
		t.Fatalf("login: %v", err)
	}
	if len(h.events.created) != 0 {
		t.Fatalf("existing user must not emit user.created, got %v", h.events.created)
	}
	if len(h.events.succeeded) != 1 {
		t.Fatalf("want one login.succeeded, got %d", len(h.events.succeeded))
	}
}

func TestLoginUnknownTypeRejected(t *testing.T) {
	h := newLoginHarness()

	if _, err := h.svc.Login(context.Background(), &LoginInput{Type: "nope"}); err == nil {
		t.Fatal("want error")
	}
	if h.sessions.issued != 0 {
		t.Fatalf("unknown type must not issue session, issued=%d", h.sessions.issued)
	}
	if n := len(h.events.created) + len(h.events.succeeded) + len(h.events.failed); n != 0 {
		t.Fatalf("unknown type must not emit events, got %d", n)
	}
}
