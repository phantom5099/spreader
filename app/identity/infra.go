package identity

import (
	"context"
	"fmt"

	"github.com/phantom5099/spreader/app/identity/internal/platform/postgres"
	"github.com/phantom5099/spreader/app/identity/internal/platform/redis"
	"github.com/phantom5099/spreader/app/platform/config"
)

// Infra 进程级基础设施句柄。构造细节（驱动、连接池参数）不越出模块，
// 入口只负责持有、探活与关闭。
type Infra struct {
	db    *postgres.Pool
	cache *redis.Client
}

// OpenInfra 按配置建立 PG 与 Redis 连接；任一失败即返回错误，调用方退出。
func OpenInfra(ctx context.Context, cfg *config.Config) (*Infra, error) {
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

// CleanupExpired 清理过期数据（验证码、会话、审计等）。
func (i *Infra) CleanupExpired(ctx context.Context) error { return i.db.CleanupExpired(ctx) }
