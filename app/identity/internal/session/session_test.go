package session

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// fakeStore / fakeRev / fakeVer / fakeEvents：会话域自声明接口的测试替身（无存储标签）。
type fakeStore struct {
	sessions map[string]*Session // key: rt_hash
	revoked  map[string]bool     // key: family_id
	rotErr   error
}

func newFakeStore() *fakeStore {
	return &fakeStore{sessions: map[string]*Session{}, revoked: map[string]bool{}}
}

func (f *fakeStore) Create(_ context.Context, s *Session) error {
	cp := *s
	f.sessions[s.RTHash] = &cp
	return nil
}

func (f *fakeStore) GetByTokenHash(_ context.Context, hash string) (*Session, error) {
	s, ok := f.sessions[hash]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

func (f *fakeStore) RotateToken(_ context.Context, id, oldHash, newHash string, newExpiresUnix int64) error {
	if f.rotErr != nil {
		return f.rotErr
	}
	s, ok := f.sessions[oldHash]
	if !ok || s.ID != id {
		return ErrReplayed
	}
	delete(f.sessions, oldHash)
	s.RTHash = newHash
	s.ExpiresAtUnix = newExpiresUnix
	f.sessions[newHash] = s
	return nil
}

func (f *fakeStore) RevokeFamily(_ context.Context, familyID string) ([]string, error) {
	f.revoked[familyID] = true
	return []string{"u-1"}, nil
}

type fakeRev struct {
	used map[string]string
}

func newFakeRev() *fakeRev { return &fakeRev{used: map[string]string{}} }

func (f *fakeRev) RevokeJTI(context.Context, string, int64) error { return nil }
func (f *fakeRev) Revoked(context.Context, string) (bool, error)  { return false, nil }
func (f *fakeRev) TokenVersion(context.Context, string) (int64, bool, error) {
	return 0, false, nil
}
func (f *fakeRev) SetTokenVersion(context.Context, string, int64, int64) {}
func (f *fakeRev) SaveUsedRT(_ context.Context, hash, family string, _ int64) error {
	f.used[hash] = family
	return nil
}
func (f *fakeRev) GetUsedRT(_ context.Context, hash string) (string, error) {
	fam, ok := f.used[hash]
	if !ok {
		return "", ErrNotFound
	}
	return fam, nil
}

type fakeVer struct{ ver int64 }

func (f *fakeVer) TokenVersionOf(context.Context, string) (int64, error) { return f.ver, nil }

type fakeEvents struct{ revoked int }

func (f *fakeEvents) SessionRevoked(context.Context, string, string, string, string) {
	f.revoked++
}

func newTestIssuer() (*Issuer, *fakeStore, *fakeRev, *fakeEvents) {
	store := newFakeStore()
	rev := newFakeRev()
	ev := &fakeEvents{}
	iss := NewIssuer(store, rev, &fakeVer{ver: 0}, ev, Config{
		ATSecret: "unit-test-secret",
		ATTTL:    15 * time.Minute,
		RTTTL:    24 * time.Hour,
	})
	return iss, store, rev, ev
}

func TestIssueAndAuthorize(t *testing.T) {
	iss, _, _, _ := newTestIssuer()
	access, refresh, expiresIn, err := iss.Issue(context.Background(), "u-1", 3, "dev-1", "app")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if refresh == "" || access == "" || expiresIn != int64(15*time.Minute.Seconds()) {
		t.Fatalf("bad issue result")
	}
	info, err := iss.VerifyAndAuthorize(context.Background(), access)
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	if info.UserID != "u-1" || info.SessionID == "" || info.JTI == "" {
		t.Fatalf("bad auth info: %+v", info)
	}
	_ = refresh
}

func TestRefreshRotationAndReplayRevoke(t *testing.T) {
	iss, store, rev, ev := newTestIssuer()
	_, rt1, _, err := iss.Issue(context.Background(), "u-1", 0, "", "")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	// 正常轮换：旧 RT → 新 RT。
	_, rt2, _, _, err := iss.Refresh(context.Background(), rt1, "")
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if rt2 == rt1 {
		t.Fatal("rotation must produce a new RT")
	}
	// 重放旧 RT：整族撤销，双方下线。
	_, _, _, _, err = iss.Refresh(context.Background(), rt1, "")
	var de *login.Error
	if !errors.As(err, &de) || de.Reason != "IAM_REFRESH_TOKEN_REUSED" {
		t.Fatalf("want reuse error, got %v", err)
	}
	if !de.Retryable && de.HTTP != 401 {
		t.Fatalf("domain error should carry 401, got %+v", de)
	}
	if !store.revoked["replayed-family-unset"] && len(store.revoked) == 0 {
		t.Fatal("family must be revoked on replay")
	}
	if ev.revoked == 0 {
		t.Fatal("session.revoked event must fire")
	}
	_ = rev
}

func TestUnknownRefreshToken(t *testing.T) {
	iss, _, _, _ := newTestIssuer()
	_, _, _, _, err := iss.Refresh(context.Background(), "deadbeef", "")
	if err == nil {
		t.Fatal("unknown refresh token must fail")
	}
	var de *login.Error
	if errors.As(err, &de) && de.Reason == "IAM_REFRESH_TOKEN_REUSED" {
		t.Fatal("unknown token must not be treated as replay (no family to revoke)")
	}
}
