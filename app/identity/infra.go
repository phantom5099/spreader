package identity

import (
	"context"
	"fmt"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/platform/postgres"
	"github.com/phantom5099/spreader/app/identity/internal/platform/redis"
	"github.com/phantom5099/spreader/app/platform/config"
)

// openTimeout 建连 + 迁移的总上界：超时即启动失败，让编排层重启而不是挂在半启动状态。
const openTimeout = 15 * time.Second

// Infra 进程级基础设施句柄。构造细节（驱动、连接池参数）不越出模块，
// 入口只负责持有、探活与关闭。
type Infra struct {
	db    *postgres.Pool
	cache *redis.Client
}

// OpenInfra 按配置建立 PG 与 Redis 连接；任一失败即返回错误，调用方退出。
// 启动探活必须有上界：signal ctx 只响应 SIGINT/SIGTERM，依赖不可达时会一直等到 TCP 超时。
func OpenInfra(ctx context.Context, cfg *config.Config) (*Infra, error) {
	ctx, cancel := context.WithTimeout(ctx, openTimeout)
	defer cancel()

	dsn, err := config.RequireEnv(cfg.Database.DSNEnv)
	if err != nil {
		return nil, err
	}
	db, err := postgres.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}
	cache, err := redis.New(ctx, &redis.Options{
		Mode:       cfg.Redis.Mode,
		Addrs:      cfg.Redis.Addrs,
		MasterName: cfg.Redis.MasterName,
		Password:   cfg.Redis.Password,
		DB:         cfg.Redis.DB,
	})
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("redis: %w", err)
	}
	return &Infra{db: db, cache: cache}, nil
}

// Close 释放连接；可重复调用。
func (i *Infra) Close() {
	if i == nil {
		return
	}
	_ = i.cache.Close()
	i.db.Close()
}

// PGPoolStats 供指标采样。
func (i *Infra) PGPoolStats() (total, idle, acquired, limit int) { return i.db.PGPoolStats() }

// CleanupStats 转发清理计数（postgres 是 internal，入口层引用不到）。
type CleanupStats = postgres.CleanupStats

// CleanupExpired 清理 PG 里的过期数据：过期 30 天的会话行、超过 12 个月的审计行。
// 验证码、challenge、AT 撤销标记都在 Redis 靠 TTL 自过期，不经过这里。
func (i *Infra) CleanupExpired(ctx context.Context) (CleanupStats, error) {
	return i.db.CleanupExpired(ctx)
}
