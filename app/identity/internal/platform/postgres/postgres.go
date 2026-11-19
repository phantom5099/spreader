// Package postgres 平台层：PG 连接池、schema 迁移与 login 域仓储实现。
// 实现负责把驱动错误映射为领域错误（哨兵/领域 *Error），上层永不分支于驱动错误。
package postgres

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

// connectTimeout 单次建连上界。pgx 默认 2 分钟，远长于任何请求预算：显式收到 5s，
// 让「连不上」快速失败，而不是把一个请求吊到自己的 deadline 才报错。
const connectTimeout = 5 * time.Second

// New 建立连接池并执行幂等迁移。
func New(ctx context.Context, dsn string) (*Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.ConnectTimeout = connectTimeout
	p, err := pgxpool.NewWithConfig(ctx, cfg)
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

// PGPoolStats 连接池快照（供 metrics 包 15s 采样成 Gauge）。
func (p *Pool) PGPoolStats() (total, idle, acquired, limit int) {
	st := p.p.Stat()
	return int(st.TotalConns()), int(st.IdleConns()), int(st.AcquiredConns()), int(st.MaxConns())
}

const (
	// sessionRetentionDays 会话行在自然过期后再留存的天数。没有读取方依赖这段宽限
	// （唯一读 sessions 的查询带 expires_at > now()），纯粹为事后排障复核。
	sessionRetentionDays = 30
	// auditRetentionMonths 登录审计留存期（12 个月，按日历月算，不是 365 天）。
	auditRetentionMonths = 12
	// cleanupBatchSize 单条 DELETE 的行数上限。
	cleanupBatchSize = 1000
	// cleanupMaxBatches 单轮每表的批数上限：一轮最多删 10 万行，
	// 防止大表上一轮把调用方的超时预算吃光。
	cleanupMaxBatches = 100
)

// CleanupStats 单轮清理的删除行数。清理是否真的在推进，只能靠它判断。
type CleanupStats struct {
	Sessions   int64
	LoginAudit int64
}

// CleanupExpired 清理过期数据：过期 30 天的会话行 + 超过 12 个月的审计行
// （§4.5 不变量/N7：审计保留 12 个月到期清理；会话稳态规模 = 活跃用户 × 设备数）。
//
// 验证码、challenge、AT 撤销标记都不在这里：它们在 Redis，靠 TTL 自过期。
func (p *Pool) CleanupExpired(ctx context.Context) (CleanupStats, error) {
	var st CleanupStats
	n, err := deleteInBatches(ctx, p.p, `
		DELETE FROM sessions WHERE id IN (
			SELECT id FROM sessions
			WHERE expires_at < now() - make_interval(days => $1::int)
			LIMIT $2
			FOR UPDATE SKIP LOCKED)`, sessionRetentionDays)
	st.Sessions = n
	if err != nil {
		return st, fmt.Errorf("cleanup sessions: %w", err)
	}
	n, err = deleteInBatches(ctx, p.p, `
		DELETE FROM login_audit WHERE id IN (
			SELECT id FROM login_audit
			WHERE created_at < now() - make_interval(months => $1::int)
			LIMIT $2
			FOR UPDATE SKIP LOCKED)`, auditRetentionMonths)
	st.LoginAudit = n
	if err != nil {
		return st, fmt.Errorf("cleanup login_audit: %w", err)
	}
	return st, nil
}

// deleteInBatches 分批执行一条删除语句，直到删不满一批或达到批数上限。
//
// 两点是刻意的：
//   - 有界。一条无界 DELETE 在大表上要么长时间持锁，要么撞上调用方 deadline 整体回滚，
//     下一轮面对的仍是同一批行，永远删不完。
//   - FOR UPDATE SKIP LOCKED（见语句本身）。多副本各自跑清理时各删各的：不重复劳动，
//     也不互相等锁，顺带避开正在被轮换/登出更新的活跃会话行。
//
// ex 取最小接口而非 *pgxpool.Pool，只为了让循环边界能在不连库的情况下被验证。
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func deleteInBatches(ctx context.Context, ex execer, sql string, retention int) (int64, error) {
	var total int64
	for i := 0; i < cleanupMaxBatches; i++ {
		tag, err := ex.Exec(ctx, sql, retention, cleanupBatchSize)
		if err != nil {
			return total, err
		}
		n := tag.RowsAffected()
		total += n
		if n < cleanupBatchSize {
			break
		}
	}
	return total, nil
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
