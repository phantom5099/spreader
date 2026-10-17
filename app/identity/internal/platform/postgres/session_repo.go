package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/session"
)

var (
	_ session.Store         = (*Pool)(nil)
	_ session.VersionSource = (*Pool)(nil)
)

// Create 实现 session.Store。
func (p *Pool) Create(ctx context.Context, s *session.Session) error {
	_, err := p.p.Exec(ctx,
		`INSERT INTO sessions (id, user_id, family_id, device_id, platform, rt_hash, expires_at)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
		s.ID, s.UserID, s.FamilyID, s.DeviceID, s.Platform, s.RTHash,
		time.Unix(s.ExpiresAtUnix, 0))
	return err
}

// GetByTokenHash 实现 session.Store。
func (p *Pool) GetByTokenHash(ctx context.Context, rtHash string) (*session.Session, error) {
	var (
		s         session.Session
		revokedAt *time.Time
	)
	err := p.p.QueryRow(ctx,
		`SELECT id::text, user_id::text, family_id::text, device_id, platform, rt_hash,
		        revoked_at, EXTRACT(epoch FROM expires_at)::bigint
		   FROM sessions WHERE rt_hash=$1 AND expires_at > now()`, rtHash).
		Scan(&s.ID, &s.UserID, &s.FamilyID, &s.DeviceID, &s.Platform, &s.RTHash, &revokedAt, &s.ExpiresAtUnix)
	if errors.Is(err, ErrNotFound) {
		return nil, session.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if revokedAt != nil {
		s.Revoked = true
	}
	return &s, nil
}

// RotateToken 实现 session.Store：原子 CAS 轮换，0 行命中 = 并发刷新/重放。
func (p *Pool) RotateToken(ctx context.Context, id, oldHash, newHash string, newExpiresUnix int64) error {
	tag, err := p.p.Exec(ctx,
		`UPDATE sessions SET rt_hash=$3, expires_at=$4, last_seen_at=now()
		  WHERE id=$1::uuid AND rt_hash=$2 AND revoked_at IS NULL`,
		id, oldHash, newHash, time.Unix(newExpiresUnix, 0))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return session.ErrReplayed
	}
	return nil
}

// RevokeFamily 实现 session.Store：整族吊销（幂等），返回族内 user_id 列表。
func (p *Pool) RevokeFamily(ctx context.Context, familyID string) ([]string, error) {
	rows, err := p.p.Query(ctx,
		`UPDATE sessions SET revoked_at=now() WHERE family_id=$1::uuid AND revoked_at IS NULL
		 RETURNING user_id::text`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// TokenVersionOf 实现 session.VersionSource（token_version 事实源：users.token_version）。
func (p *Pool) TokenVersionOf(ctx context.Context, userID string) (int64, error) {
	var ver int64
	err := p.p.QueryRow(ctx,
		`SELECT token_version FROM users WHERE id=$1::uuid`, userID).Scan(&ver)
	if errors.Is(err, ErrNotFound) {
		return 0, session.ErrNotFound
	}
	return ver, err
}

// WriteLoginAudit 供 Kafka 审计消费者批量写入（cmd/ 以函数注入，不引接口）。
// identifier_masked 已由发布方脱敏；完整手机号/邮箱不落审计表。
func (p *Pool) WriteLoginAudit(ctx context.Context, rows []LoginAuditRow) error {
	batch := &pgxBatch{}
	for _, r := range rows {
		batch.Queue(`INSERT INTO login_audit
			(user_id, login_type, identifier_masked, result, reason, ip, device_id,
			 captcha_challenge_id, captcha_kind, captcha_result)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			nullUUID(r.UserID), r.LoginType, r.IdentifierMasked, r.Result, r.Reason, r.IP, r.DeviceID,
			r.CaptchaChallengeID, r.CaptchaKind, r.CaptchaResult)
	}
	br := p.p.SendBatch(ctx, batch)
	defer func() { _ = br.Close() }()
	for range rows {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

// LoginAuditRow 审计行（与 Kafka 事件载荷一一对应）。
type LoginAuditRow struct {
	UserID             string `json:"user_id,omitempty"`
	LoginType          string `json:"login_type"`
	IdentifierMasked   string `json:"identifier_masked"`
	Result             string `json:"result"`
	Reason             string `json:"reason,omitempty"`
	IP                 string `json:"ip,omitempty"`
	DeviceID           string `json:"device_id,omitempty"`
	CaptchaChallengeID string `json:"captcha_challenge_id,omitempty"`
	CaptchaKind        string `json:"captcha_kind,omitempty"`
	CaptchaResult      string `json:"captcha_result,omitempty"`
}
