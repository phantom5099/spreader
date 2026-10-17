// Package otp 验证码域：生成/存哈希/校验/发送频控与主备通道降级。
package otp

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/login"
)

// Config 验证码域参数（来自配置）。
type Config struct {
	TTLSeconds       int64 // 验证码有效期 300s
	CodeLength       int   // 6
	CooldownSeconds  int64 // 发送冷却 60s（产品承诺硬指标）
	DailyLimit       int64 // 单号码日额度
	PerIPPerHour     int64
	PerDevicePerHour int64
	GlobalPerMinute  int64    // 全局熔断阈值
	Pepper           string   // HMAC pepper：存哈希不存明文（env 注入）
	SceneIsolation   []string // 场景白名单：非白名单 scene 直接拒绝（防挑战挪用/键空间污染）
}

// Store 状态存储（redis 实现）：键由本域按 §5.2 规约构造，实现只执行原语。
type Store interface {
	SaveCode(ctx context.Context, key, val string, ttlSeconds int64) error
	// GetCode 读取（不消费）；ErrNotFound = 不存在/过期。
	GetCode(ctx context.Context, key string) (string, error)
	DeleteCode(ctx context.Context, key string) error
	// ConsumeIfMatch Lua 原子「比对相等才删除」：防并发同码双过（§4.3 消费不变量）。
	// 返回 matched；键不存在返回 false。
	ConsumeIfMatch(ctx context.Context, key, expect string) (bool, error)
	// Incr 计数 +1；键首次创建时设置 TTL（expire-once）。
	Incr(ctx context.Context, key string, ttlSeconds int64) (int64, error)
	// RemainingTTL 键剩余秒数；不存在返回 0。
	RemainingTTL(ctx context.Context, key string) (int64, error)
}

// Sender 单条发送通道（console/smtp/mail139_bridge/cloud_sms 实现）。
type Sender interface {
	Send(ctx context.Context, to, code string) error
}

// Router 主备通道路由：主通道失败自动降级备用；全部不可用 → 503 CHANNEL_UNAVAILABLE。
type Router struct {
	chains map[string][]Sender // "phone" → [primary, fallback, ...]；"email" 同
}

func NewRouter(chains map[string][]Sender) *Router { return &Router{chains: chains} }

func (r *Router) Send(ctx context.Context, channel, to, code string) error {
	chain, ok := r.chains[channel]
	if !ok || len(chain) == 0 {
		return login.EChannelUnavailable()
	}
	for _, s := range chain {
		if err := s.Send(ctx, to, code); err == nil {
			return nil
		}
	}
	return login.EChannelUnavailable()
}

// Service 验证码域：生成/存储/校验/限流。
type Service struct {
	store  Store
	router *Router
	cfg    Config
}

func NewService(store Store, router *Router, cfg Config) *Service {
	return &Service{store: store, router: router, cfg: cfg}
}

// —— 键构造（§5.2 Redis 键规约，键由本域拥有）——

func codeKey(scene, channel, dest string) string {
	return fmt.Sprintf("iam:otp:code:%s:%s:%s", scene, channel, dest)
}
func attemptsKey(scene, channel, dest string) string {
	return fmt.Sprintf("iam:otp:attempts:%s:%s:%s", scene, channel, dest)
}
func cooldownKey(dest string) string { return "iam:otp:send:cooldown:" + dest }
func dailyKey(dest string) string    { return "iam:otp:send:daily:" + dest }
func ipKey(ip string) string         { return "iam:otp:send:ip:" + ip }
func deviceKey(d string) string      { return "iam:otp:send:device:" + d }

const globalKey = "iam:otp:send:global"

func (s *Service) hmacCode(code string) string {
	m := hmac.New(sha256.New, []byte(s.cfg.Pepper))
	m.Write([]byte(code))
	return hex.EncodeToString(m.Sum(nil))
}

func genCode(n int) string {
	if n <= 0 || n > 10 {
		n = 6
	}
	limit := uint64(1)
	for i := 0; i < n; i++ {
		limit *= 10
	}
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	v := uint64(0)
	for _, x := range b {
		v = v<<8 | uint64(x)
	}
	return fmt.Sprintf("%0*d", n, v%limit)
}

func ttlUntilMidnight() int64 {
	now := time.Now()
	mid := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	return int64(mid.Sub(now).Seconds())
}

// Send 发送验证码：冷却/日额度/IP/设备/全局熔断 → 生成 → 存哈希 → 主备通道发送 → 设冷却。
// 频控键全部带 TTL，状态自清理；发送失败不落冷却（可立即重试其他通道/时间）。
func (s *Service) Send(ctx context.Context, channel, dest, scene, ip, deviceID string) (int64, error) {
	if channel != "phone" && channel != "email" {
		return 0, login.EBadRequest("unknown channel: " + channel)
	}
	if !s.sceneAllowed(scene) {
		return 0, login.EBadRequest("scene not allowed: " + scene)
	}
	if left, err := s.store.RemainingTTL(ctx, cooldownKey(dest)); err == nil && left > 0 {
		return left, login.EOtpSendTooFrequent()
	}
	if s.cfg.DailyLimit > 0 {
		if n, err := s.store.Incr(ctx, dailyKey(dest), ttlUntilMidnight()); err == nil && n > s.cfg.DailyLimit {
			return 0, login.EOtpDailyLimitExceeded()
		}
	}
	if s.cfg.PerIPPerHour > 0 && ip != "" {
		if n, err := s.store.Incr(ctx, ipKey(ip), 3600); err == nil && n > s.cfg.PerIPPerHour {
			return 0, login.ETooManyAttempts()
		}
	}
	if s.cfg.PerDevicePerHour > 0 && deviceID != "" {
		if n, err := s.store.Incr(ctx, deviceKey(deviceID), 3600); err == nil && n > s.cfg.PerDevicePerHour {
			return 0, login.ETooManyAttempts()
		}
	}
	if s.cfg.GlobalPerMinute > 0 {
		if n, err := s.store.Incr(ctx, globalKey, 60); err == nil && n > s.cfg.GlobalPerMinute {
			return 0, login.EOtpSendTooFrequent() // 熔断：整体降速
		}
	}

	code := genCode(s.cfg.CodeLength)
	if err := s.store.SaveCode(ctx, codeKey(scene, channel, dest), s.hmacCode(code), s.cfg.TTLSeconds); err != nil {
		return 0, err
	}
	if err := s.router.Send(ctx, channel, dest, code); err != nil {
		_ = s.store.DeleteCode(ctx, codeKey(scene, channel, dest)) // 发送失败不留下可校验的码
		return 0, err
	}
	if err := s.store.SaveCode(ctx, cooldownKey(dest), "1", s.cfg.CooldownSeconds); err != nil {
		return 0, err
	}
	return s.cfg.CooldownSeconds, nil
}

// maxVerifyAttempts 校验失败尝试上限（与验证码同 TTL）。
const maxVerifyAttempts = 5

// sceneAllowed 场景白名单（§4.3 scene 隔离：登录码不能用于重置密码）。
func (s *Service) sceneAllowed(scene string) bool {
	if len(s.cfg.SceneIsolation) == 0 {
		return true
	}
	for _, sc := range s.cfg.SceneIsolation {
		if sc == scene {
			return true
		}
	}
	return false
}

// Verify 校验并消费验证码（供 login 域的 OTPVerifier 窄接口调用）。
// 合并错误码防枚举：错误/过期/尝试过多统一 EOtpInvalid。
func (s *Service) Verify(ctx context.Context, channel, dest, code string) error {
	key := codeKey("login", channel, dest)
	// Lua 原子「比对相等才删除」：并发同码请求只有一个能消费成功。
	matched, err := s.store.ConsumeIfMatch(ctx, key, s.hmacCode(code))
	if err != nil {
		return login.EOtpInvalid()
	}
	if matched {
		return nil
	}
	n, _ := s.store.Incr(ctx, attemptsKey("login", channel, dest), s.cfg.TTLSeconds)
	if n >= maxVerifyAttempts {
		_ = s.store.DeleteCode(ctx, key) // 尝试过多，作废该验证码
	}
	return login.EOtpInvalid()
}

// 满足接口关系（编译期校验）。
var _ login.OTPVerifier = (*Service)(nil)
