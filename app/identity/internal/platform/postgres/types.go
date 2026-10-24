package postgres

import (
	"github.com/jackc/pgx/v5"

	"github.com/phantom5099/spreader/app/identity/internal/session"
)

// 类型别名：让各仓储文件保持与领域接口一致的签名书写方式。
type (
	pgxRow   = pgx.Row
	pgxTx    = pgx.Tx
	pgxBatch = pgx.Batch
)

var _ = session.ErrReplayed

// nullUUID 空串 → SQL NULL（login_audit.user_id 可空：失败且账号不存在时为 NULL）。
func nullUUID(s string) any {
	if s == "" {
		return nil
	}
	return s
}
