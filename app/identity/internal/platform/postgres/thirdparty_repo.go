package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// FindIdentity 实现 login.ThirdPartyRepository：应用级查找键 (provider, appid, external_id)。
func (p *Pool) FindIdentity(ctx context.Context, provider, appid, externalID string) (*login.ThirdPartyIdentity, error) {
	var (
		ident      login.ThirdPartyIdentity
		profileRaw []byte
	)
	err := p.p.QueryRow(ctx,
		`SELECT user_id, provider, appid, external_id, profile_json
		   FROM third_party_identities
		  WHERE provider=$1 AND appid=$2 AND external_id=$3`,
		provider, appid, externalID).
		Scan(&ident.UserID, &ident.Provider, &ident.AppID, &ident.ExternalID, &profileRaw)
	if errors.Is(err, ErrNotFound) {
		return nil, login.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var profile map[string]string
	if len(profileRaw) > 0 {
		_ = json.Unmarshal(profileRaw, &profile)
	}
	ident.Nickname = profile["nickname"]
	ident.AvatarURL = profile["avatar_url"]
	return &ident, nil
}

// FindAccount 实现 login.ThirdPartyRepository：主体级归并查找 (provider, subject_id)。
func (p *Pool) FindAccount(ctx context.Context, provider, subjectID string) (*login.ThirdPartyAccountLink, error) {
	var l login.ThirdPartyAccountLink
	err := p.p.QueryRow(ctx,
		`SELECT user_id, provider, subject_id FROM third_party_accounts
		  WHERE provider=$1 AND subject_id=$2`, provider, subjectID).
		Scan(&l.UserID, &l.Provider, &l.SubjectID)
	if errors.Is(err, ErrNotFound) {
		return nil, login.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// CreateLinkedUser 实现 login.ThirdPartyRepository：
// 建号 + 主体级绑定 + 应用级身份，同一事务——「账号在、绑定丢」不可能中间态。
// 任何一步唯一冲突即整体回滚：身份冲突回查收敛（created=false），主体冲突返回 ErrSubjectConflict。
func (p *Pool) CreateLinkedUser(ctx context.Context, ident *login.ThirdPartyIdentity) (*login.User, bool, error) {
	tx, err := p.p.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, lerr := tx.Exec(ctx, "SET LOCAL lock_timeout = '3s'"); lerr != nil {
		return nil, false, lerr // 冲突时快速失败而非堆积（§4.8）
	}

	var userID string
	err = tx.QueryRow(ctx,
		`INSERT INTO users DEFAULT VALUES RETURNING id`).Scan(&userID)
	if err != nil {
		return nil, false, err
	}
	if ident.SubjectID != "" {
		tag, terr := tx.Exec(ctx,
			`INSERT INTO third_party_accounts (user_id, provider, subject_id)
			 VALUES ($1::uuid, $2, $3) ON CONFLICT (provider, subject_id) DO NOTHING`,
			userID, ident.Provider, ident.SubjectID)
		if terr != nil {
			return nil, false, err
		}
		if tag.RowsAffected() == 0 {
			// 主体已绑另一账号：回滚新建号，暴露冲突交绑定/合并流程。
			return nil, false, login.ErrSubjectConflict
		}
	}
	profile, _ := json.Marshal(map[string]string{
		"nickname": ident.Nickname, "avatar_url": ident.AvatarURL,
	})
	tag, err := tx.Exec(ctx,
		`INSERT INTO third_party_identities (user_id, provider, appid, external_id, profile_json, last_login_at)
		 VALUES ($1::uuid, $2, $3, $4, $5::jsonb, now())
		 ON CONFLICT (provider, appid, external_id) DO NOTHING`,
		userID, ident.Provider, ident.AppID, ident.ExternalID, string(profile))
	if err != nil {
		return nil, false, err
	}
	if tag.RowsAffected() == 0 {
		// 应用级身份已被并发登录抢占：回滚，回查后收敛到对方账号。
		_ = tx.Rollback(ctx)
		row, ferr := p.FindIdentity(ctx, ident.Provider, ident.AppID, ident.ExternalID)
		if ferr != nil {
			return nil, false, ferr
		}
		u, uerr := p.GetByID(ctx, row.UserID)
		if uerr != nil {
			return nil, false, uerr
		}
		return u, false, nil
	}
	if cerr := tx.Commit(ctx); cerr != nil {
		return nil, false, cerr
	}
	u, err := p.GetByID(ctx, userID)
	if err != nil {
		return nil, false, err
	}
	return u, true, nil
}

// TouchIdentityLastLogin 实现 login.ThirdPartyRepository。
func (p *Pool) TouchIdentityLastLogin(ctx context.Context, provider, appid, externalID string) error {
	_, err := p.p.Exec(ctx,
		`UPDATE third_party_identities SET last_login_at=now()
		  WHERE provider=$1 AND appid=$2 AND external_id=$3`, provider, appid, externalID)
	return err
}

// CreateAccount 实现 login.ThirdPartyRepository：冲突即 ErrSubjectConflict。
func (p *Pool) CreateAccount(ctx context.Context, userID, provider, subjectID string) error {
	tag, err := p.p.Exec(ctx,
		`INSERT INTO third_party_accounts (user_id, provider, subject_id)
		 VALUES ($1::uuid, $2, $3) ON CONFLICT (provider, subject_id) DO NOTHING`,
		userID, provider, subjectID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var owner string
		if err := p.p.QueryRow(ctx,
			`SELECT user_id FROM third_party_accounts WHERE provider=$1 AND subject_id=$2`,
			provider, subjectID).Scan(&owner); err != nil {
			return err
		}
		if owner != userID {
			return login.ErrSubjectConflict
		}
	}
	return nil
}

// CreateIdentity 实现 login.ThirdPartyRepository：补插新端身份行（同人多端归并路径）。
func (p *Pool) CreateIdentity(ctx context.Context, userID string, ident *login.ThirdPartyIdentity) (bool, error) {
	profile, _ := json.Marshal(map[string]string{
		"nickname": ident.Nickname, "avatar_url": ident.AvatarURL,
	})
	tag, err := p.p.Exec(ctx,
		`INSERT INTO third_party_identities (user_id, provider, appid, external_id, profile_json, last_login_at)
		 VALUES ($1::uuid, $2, $3, $4, $5::jsonb, now())
		 ON CONFLICT (provider, appid, external_id) DO NOTHING`,
		userID, ident.Provider, ident.AppID, ident.ExternalID, string(profile))
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
