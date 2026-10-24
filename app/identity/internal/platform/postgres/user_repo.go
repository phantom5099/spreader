package postgres

import (
	"context"
	"errors"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// Compile-time interface checks（接口由 login 域声明，本包实现；session 域接口见 session_repo.go）。
var (
	_ login.UserRepository       = (*Pool)(nil)
	_ login.CredentialRepository = (*Pool)(nil)
	_ login.ThirdPartyRepository = (*Pool)(nil)
)

// created_at 在 SQL 侧转 epoch 秒：模型层 CreatedAtUnix 是 int64，
// pgx 无法把 timestamptz 直接扫进整型。
const userCols = `id, phone, email, nickname, avatar_url, status, token_version, EXTRACT(EPOCH FROM created_at)::bigint AS created_at_unix`

func scanUser(row pgxRow) (*login.User, error) {
	var u login.User
	var status string
	var phone, email, nickname, avatar *string
	if err := row.Scan(&u.ID, &phone, &email, &nickname, &avatar, &status, &u.TokenVersion, &u.CreatedAtUnix); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, login.ErrNotFound
		}
		return nil, err
	}
	if phone != nil {
		u.Phone = *phone
	}
	if email != nil {
		u.Email = *email
	}
	if nickname != nil {
		u.Nickname = *nickname
	}
	if avatar != nil {
		u.AvatarURL = *avatar
	}
	u.Status = login.UserStatus(status)
	return &u, nil
}

// GetByID 实现 login.UserRepository。
func (p *Pool) GetByID(ctx context.Context, id string) (*login.User, error) {
	return scanUser(p.p.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id=$1::uuid`, id))
}

// GetByPhone 实现 login.UserRepository。
func (p *Pool) GetByPhone(ctx context.Context, e164 string) (*login.User, error) {
	return scanUser(p.p.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE phone=$1`, e164))
}

// GetByEmail 实现 login.UserRepository。
func (p *Pool) GetByEmail(ctx context.Context, lower string) (*login.User, error) {
	return scanUser(p.p.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE email=$1`, lower))
}

// CreatePhoneUser 实现 login.UserRepository：唯一约束 (phone) 仲裁 + 回查，无空窗。
func (p *Pool) CreatePhoneUser(ctx context.Context, e164 string) (*login.User, bool, error) {
	return p.createUser(ctx, func(tx pgxTx) (*login.User, bool, error) {
		tag, err := tx.Exec(ctx,
			`INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING`, e164)
		if err != nil {
			return nil, false, err
		}
		u, err := p.GetByPhone(ctx, e164)
		if err != nil {
			return nil, false, err
		}
		return u, tag.RowsAffected() == 1, nil
	})
}

// CreateEmailUser 实现 login.UserRepository：唯一约束 (email) 仲裁 + 回查。
func (p *Pool) CreateEmailUser(ctx context.Context, lower string) (*login.User, bool, error) {
	return p.createUser(ctx, func(tx pgxTx) (*login.User, bool, error) {
		tag, err := tx.Exec(ctx,
			`INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, lower)
		if err != nil {
			return nil, false, err
		}
		u, err := p.GetByEmail(ctx, lower)
		if err != nil {
			return nil, false, err
		}
		return u, tag.RowsAffected() == 1, nil
	})
}

// createUser 包装事务：推测式插入 + 回查在同一读已提交语义下无空窗
// （对方 XID 未提交时 INSERT 在唯一索引上等待，对方提交后回查必然可见）。
func (p *Pool) createUser(ctx context.Context, fn func(tx pgxTx) (*login.User, bool, error)) (*login.User, bool, error) {
	tx, err := p.p.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, lerr := tx.Exec(ctx, "SET LOCAL lock_timeout = '3s'"); lerr != nil {
		return nil, false, lerr // 冲突时快速失败而非堆积（§4.8）
	}
	u, created, err := fn(tx)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return u, created, nil
}

// GetPasswordHash 实现 login.CredentialRepository。
func (p *Pool) GetPasswordHash(ctx context.Context, identifier string) (string, error) {
	var phc string
	err := p.p.QueryRow(ctx,
		`SELECT secret FROM user_credentials WHERE kind='password' AND identifier=$1 LIMIT 1`,
		identifier).Scan(&phc)
	if errors.Is(err, ErrNotFound) {
		return "", login.ErrNotFound
	}
	return phc, err
}
