package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// ErrReplayed 哨兵：CAS 轮换 0 行命中（并发刷新或重放）。
var ErrReplayed = replayedError{}

type replayedError struct{}

func (replayedError) Error() string { return "refresh token replayed" }

// Session 会话行（RT 轮换链与重放检测的事实源；事实源在 PG，Redis 只承载热状态）。
type Session struct {
	ID            string // 与 FamilyID 同值：一行 = 一次登录的轮换链
	UserID        string
	FamilyID      string
	DeviceID      string
	Platform      string
	RTHash        string // 当前有效 RT 的 SHA-256，原始令牌永不入库
	Revoked       bool
	ExpiresAtUnix int64
}

// Store 会话存储（postgres 实现）。
type Store interface {
	Create(ctx context.Context, s *Session) error
	// GetByTokenHash 按当前 rt_hash 查找；ErrNotFound 表示非当前令牌。
	GetByTokenHash(ctx context.Context, rtHash string) (*Session, error)
	// RotateToken 原子轮换：WHERE id AND rt_hash=old → 影响 0 行返回 ErrReplayed。
	RotateToken(ctx context.Context, id, oldHash, newHash string, newExpiresUnix int64) error
	// RevokeFamily 整族吊销（幂等），返回族内 user_id 列表（供撤销事件投递）。
	RevokeFamily(ctx context.Context, familyID string) ([]string, error)
}

// RevocationStore 热状态（redis 实现）：AT 撤销标记、token_version 缓存、已轮换 RT 指纹。
type RevocationStore interface {
	RevokeJTI(ctx context.Context, jti string, ttlSeconds int64) error
	Revoked(ctx context.Context, jti string) (bool, error)
	TokenVersion(ctx context.Context, userID string) (int64, bool, error) // (ver, hit, err)
	SetTokenVersion(ctx context.Context, userID string, ver, ttlSeconds int64)
	// SaveUsedRT 已轮换旧 RT 指纹 → family（TTL = RT 寿命）：重放检测的路由表。
	SaveUsedRT(ctx context.Context, rtHash, familyID string, ttlSeconds int64) error
	// GetUsedRT 命中说明该 RT 已被轮换掉 → 整族撤销。ErrNotFound = 未知令牌。
	GetUsedRT(ctx context.Context, rtHash string) (familyID string, err error)
}

// VersionSource token_version 事实源读取（postgres：users.token_version）。
type VersionSource interface {
	TokenVersionOf(ctx context.Context, userID string) (int64, error)
}

// Events 会话撤销事件（kafka 实现；session.revoked → realtime 关长连接）。
type Events interface {
	SessionRevoked(ctx context.Context, userID, sessionID, familyID, reason string)
}

// Config 会话参数。
type Config struct {
	ATSecret string // env 注入
	ATTTL    time.Duration
	RTTTL    time.Duration
}

// Issuer AT(JWT HS256) 签发/校验 + RT 族轮换与重放检测。
type Issuer struct {
	store Store
	rev   RevocationStore
	ver   VersionSource
	ev    Events
	cfg   Config
	log   *slog.Logger
	now   func() time.Time
}

func NewIssuer(store Store, rev RevocationStore, ver VersionSource, ev Events, cfg Config, log *slog.Logger) *Issuer {
	return &Issuer{store: store, rev: rev, ver: ver, ev: ev, cfg: cfg, log: log, now: time.Now}
}

// warn 降级路径的统一出口：Redis 读失败按既定语义降级（放行/回源 PG），但必须告警不静默。
func (i *Issuer) warn(msg string, err error) {
	if i.log != nil {
		i.log.Warn(msg, "err", err)
	}
}

func (i *Issuer) issueAT(ctx context.Context, userID string, ver int64, familyID string) (token, jti string, exp time.Time, err error) {
	now := i.now()
	exp = now.Add(i.cfg.ATTTL)
	jti = uuid.NewString()
	claims := jwt.MapClaims{
		"sub": userID,
		"ver": ver, // token_version：改密/封禁时 +1，全集群旧令牌随之失效
		"sid": familyID,
		"jti": jti,
		"iat": now.Unix(),
		"exp": exp.Unix(),
	}
	token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(i.cfg.ATSecret))
	if err != nil {
		return "", "", time.Time{}, err
	}
	return token, jti, exp, nil
}

func newRT() (raw, hash string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	raw = hex.EncodeToString(b)
	sum := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(sum[:])
}

// Issue 签发 AT + RT，会话行落 PG（事实源）。
func (i *Issuer) Issue(ctx context.Context, userID string, ver int64, deviceID, platform string) (access, refresh string, expiresIn int64, err error) {
	family := uuid.NewString()
	rawRT, rtHash := newRT()
	now := i.now()
	rtExp := now.Add(i.cfg.RTTTL)
	if cerr := i.store.Create(ctx, &Session{
		ID: family, UserID: userID, FamilyID: family,
		DeviceID: deviceID, Platform: platform, RTHash: rtHash,
		ExpiresAtUnix: rtExp.Unix(),
	}); cerr != nil {
		return "", "", 0, cerr
	}
	access, _, _, err = i.issueAT(ctx, userID, ver, family)
	if err != nil {
		return "", "", 0, err
	}
	return access, rawRT, int64(i.cfg.ATTTL.Seconds()), nil
}

// Refresh RT 族轮换 + 重放检测。
func (i *Issuer) Refresh(ctx context.Context, rawRefresh, deviceID string) (access, refresh string, expiresIn int64, userID string, err error) {
	sum := sha256.Sum256([]byte(rawRefresh))
	presented := hex.EncodeToString(sum[:])

	s, err := i.store.GetByTokenHash(ctx, presented)
	if err != nil {
		if !errors.Is(err, ErrNotFound) {
			return "", "", 0, "", err
		}
		// 非当前令牌：查已轮换指纹表——命中即重放，整族撤销。
		if family, ferr := i.rev.GetUsedRT(ctx, presented); ferr == nil {
			return i.revokeFamily(ctx, "", family, "replay")
		} else if !errors.Is(ferr, ErrNotFound) {
			return "", "", 0, "", ferr
		}
		return "", "", 0, "", ETokenInvalidMsg("invalid refresh token")
	}
	if s.Revoked {
		return i.revokeFamily(ctx, s.UserID, s.FamilyID, "revoked")
	}

	newRaw, newHash := newRT()
	newExp := i.now().Add(i.cfg.RTTTL)
	if rerr := i.store.RotateToken(ctx, s.ID, presented, newHash, newExp.Unix()); rerr != nil {
		if errors.Is(rerr, ErrReplayed) {
			// 并发刷新/重放：检测到重放，撤销整个 family（攻击者与真实用户同时下线，逼重新登录）。
			return i.revokeFamily(ctx, s.UserID, s.FamilyID, "replay")
		}
		return "", "", 0, "", rerr
	}
	// 旧指纹进入重放检测路由表，TTL = RT 寿命。
	if serr := i.rev.SaveUsedRT(ctx, presented, s.FamilyID, int64(i.cfg.RTTTL.Seconds())); serr != nil {
		return "", "", 0, "", serr
	}
	ver, err := i.ver.TokenVersionOf(ctx, s.UserID)
	if err != nil {
		return "", "", 0, "", err
	}
	access, _, _, err = i.issueAT(ctx, s.UserID, ver, s.FamilyID)
	if err != nil {
		return "", "", 0, "", err
	}
	_ = deviceID
	return access, newRaw, int64(i.cfg.ATTTL.Seconds()), s.UserID, nil
}

func (i *Issuer) revokeFamily(ctx context.Context, userID, familyID, reason string) (access, refresh string, expiresIn int64, uid string, err error) {
	if familyID != "" {
		userIDs, err := i.store.RevokeFamily(ctx, familyID)
		if err != nil {
			return "", "", 0, "", err
		}
		if userID == "" && len(userIDs) > 0 {
			userID = userIDs[0]
		}
	}
	if userID != "" {
		i.ev.SessionRevoked(ctx, userID, familyID, familyID, reason)
	}
	return "", "", 0, "", login.ERefreshTokenReused()
}

// Revoke 登出/强制下线：撤销会话行 + AT jti 撤销标记（TTL = AT 剩余寿命）。
func (i *Issuer) Revoke(ctx context.Context, a login.AuthInfo) error {
	if _, err := i.store.RevokeFamily(ctx, a.SessionID); err != nil {
		return err
	}
	remaining := a.ExpiresAtUnix - i.now().Unix()
	if a.JTI != "" && remaining > 0 {
		if err := i.rev.RevokeJTI(ctx, a.JTI, remaining); err != nil {
			return err
		}
	}
	i.ev.SessionRevoked(ctx, a.UserID, a.SessionID, a.SessionID, "logout")
	return nil
}

// VerifyAndAuthorize 每请求鉴权：本地验签 AT → Redis 撤销标记 → token_version 比对（缓存 60s）。
// Redis 不可用时降级放行 + 由实现层告警——事实源仍在 PG，缓存故障不扩大为全员掉线。
func (i *Issuer) VerifyAndAuthorize(ctx context.Context, bearer string) (*login.AuthInfo, error) {
	tok, err := jwt.Parse(bearer, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(i.cfg.ATSecret), nil
	})
	if err != nil || !tok.Valid {
		return nil, ETokenInvalidMsg("invalid access token")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ETokenInvalidMsg("invalid claims")
	}
	userID, _ := claims["sub"].(string)
	sid, _ := claims["sid"].(string)
	jti, _ := claims["jti"].(string)
	verF, _ := claims["ver"].(float64)
	if userID == "" || jti == "" {
		return nil, ETokenInvalidMsg("invalid claims")
	}
	// claims 形状由签发方保证（验签已过）；exp 缺失按无效令牌处理（jwt 库默认不强制 exp）
	expF, expOK := claims["exp"].(float64)
	if !expOK {
		return nil, ETokenInvalidMsg("invalid claims")
	}
	expAt := time.Unix(int64(expF), 0)

	revoked, rerr := i.rev.Revoked(ctx, jti)
	if rerr != nil {
		i.warn("at revocation check failed; degrade as not revoked", rerr)
	} else if revoked {
		return nil, ETokenInvalidMsg("token revoked")
	}
	// token_version 比对：缓存 60s，miss 回源 PG。
	ver := int64(verF)
	cached, hit, cerr := i.rev.TokenVersion(ctx, userID)
	if cerr != nil {
		i.warn("token_version cache read failed; fall back to PG", cerr)
	}
	if cerr == nil && hit {
		if ver < cached {
			return nil, ETokenInvalidMsg("token version outdated")
		}
	} else if cur, verr := i.ver.TokenVersionOf(ctx, userID); verr == nil {
		i.rev.SetTokenVersion(ctx, userID, cur, 60)
		if ver < cur {
			return nil, ETokenInvalidMsg("token version outdated")
		}
	}
	return &login.AuthInfo{
		UserID: userID, SessionID: sid, JTI: jti,
		ExpiresAtUnix: expAt.Unix(),
	}, nil
}

// Authenticate 实现 login.SessionIssuer（VerifyAndAuthorize 的接口别名）。
func (i *Issuer) Authenticate(ctx context.Context, bearer string) (*login.AuthInfo, error) {
	return i.VerifyAndAuthorize(ctx, bearer)
}
