// Package postgres 平台层：PG 连接池、schema 迁移与 login 域仓储实现。
// 实现负责把驱动错误映射为领域错误（哨兵/领域 *Error），上层永不分支于驱动错误。
package postgres

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/session"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Pool pgx 连接池。
type Pool struct {
	p *pgxpool.Pool
}

// New 建立连接池并执行幂等迁移。
func New(ctx context.Context, dsn string) (*Pool, error) {
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := p.Ping(ctx); err != nil {
		p.Close()
		return nil, err
	}
	pl := &Pool{p: p}
	if err := pl.migrate(ctx); err != nil {
		p.Close()
		return nil, err
	}
	return pl, nil
}

// Close 释放连接池。
func (p *Pool) Close() { p.p.Close() }

// migrate 依序执行未应用的迁移（schema_migrations 记账）。
func (p *Pool) migrate(ctx context.Context) error {
	if _, err := p.p.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		var applied bool
		if err := p.p.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		sql, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := p.p.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

// CleanupExpired 清理过期数据：过期 30 天的会话行 + 超过 12 个月的审计行
// （§4.5 不变量/N7：审计保留 12 个月到期清理；会话稳态规模 = 活跃用户 × 设备数）。
func (p *Pool) CleanupExpired(ctx context.Context) error {
	if _, err := p.p.Exec(ctx,
		`DELETE FROM sessions WHERE expires_at < now() - interval '30 days'`); err != nil {
		return err
	}
	if _, err := p.p.Exec(ctx,
		`DELETE FROM login_audit WHERE created_at < now() - interval '12 months'`); err != nil {
		return err
	}
	return nil
}

// ErrNotFound 会话域哨兵别名（pgx.ErrNoRows 统一映射）。
var ErrNotFound = pgx.ErrNoRows

// 编译期校验：接口由消费域声明，本包实现。
var (
	_ login.UserRepository       = (*Pool)(nil)
	_ login.CredentialRepository = (*Pool)(nil)
	_ login.ThirdPartyRepository = (*Pool)(nil)
	_ session.Store              = (*Pool)(nil)
	_ session.VersionSource      = (*Pool)(nil)
)
