// Package redis 平台层：缓存/热状态的统一实现。
// 键构造随各消费域（键归消费域所有）；本包只执行 GET/SET/DEL/INCR 等原语并映射哨兵错误。
// otp.Store 与 login.ThirdPartyStore 的 SaveCode 签名不同，故以包装类型分别实现。
package redis

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/otp"
	"github.com/phantom5099/spreader/app/identity/internal/session"
)

// ErrNotFound 统一哨兵。
var ErrNotFound = errors.New("redis: not found")

// Options 连接参数：mode 决定单机 / 集群 / 哨兵三种形态（§5.2：OTP/会话/挑战状态须多副本共享）。
type Options struct {
	Mode       string   // standalone | cluster | sentinel
	Addrs      []string // standalone 1 个；cluster/sentinel 填全部节点
	MasterName string   // 仅 sentinel 必填
	Password   string
	DB         int // cluster 模式仅支持 0
}

// Client go-redis 通用客户端封装（三种形态统一走 UniversalClient）。
type Client struct {
	rdb redis.UniversalClient
}

// New 按形态建立客户端，并立即验证连通性（构造即验证：go-redis 惰性连接，
// 不在此处拨号的话，地址错误/服务未启动会潜伏到首个请求才暴露）。
func New(ctx context.Context, o *Options) (*Client, error) {
	var u redis.UniversalClient
	switch o.Mode {
	case "cluster":
		u = redis.NewClusterClient(&redis.ClusterOptions{Addrs: o.Addrs, Password: o.Password})
	case "sentinel":
		if o.MasterName == "" {
			return nil, errors.New("sentinel mode requires master_name")
		}
		u = redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName:    o.MasterName,
			SentinelAddrs: o.Addrs,
			Password:      o.Password,
			DB:            o.DB,
		})
	case "", "standalone":
		addr := ""
		if len(o.Addrs) > 0 {
			addr = o.Addrs[0]
		}
		u = redis.NewClient(&redis.Options{Addr: addr, Password: o.Password, DB: o.DB})
	default:
		return nil, errors.New("unknown redis mode: " + o.Mode)
	}
	c := &Client{rdb: u}
	if err := c.Ping(ctx); err != nil {
		_ = u.Close()
		return nil, err
	}
	return c, nil
}

// Ping 健康检查。
func (c *Client) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }

// Close 释放连接。
func (c *Client) Close() error { return c.rdb.Close() }

// 编译期校验：接口由消费域声明，本包（或其包装类型）实现。
var (
	_ otp.Store               = (*OTPStore)(nil)
	_ login.ThirdPartyStore   = (*ThirdPartyStore)(nil)
	_ login.PasswordFailGuard = (*Client)(nil)
	_ session.RevocationStore = (*Client)(nil)
	_ login.ChallengeCounters = (*Client)(nil)
)

// —— 通用原语 ——

func (c *Client) setEX(ctx context.Context, key, val string, ttlSeconds int64) error {
	return c.rdb.Set(ctx, key, val, time.Duration(ttlSeconds)*time.Second).Err()
}

func (c *Client) getDel(ctx context.Context, key string) (string, error) {
	v, err := c.rdb.GetDel(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrNotFound
	}
	return v, err
}

func (c *Client) incrOnce(ctx context.Context, key string, ttlSeconds int64) (int64, error) {
	n, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if n == 1 { // 键首次创建时设置 TTL（expire-once）
		if err := c.rdb.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second).Err(); err != nil {
			return n, err
		}
	}
	return n, nil
}

func (c *Client) get(ctx context.Context, key string) (string, error) {
	v, err := c.rdb.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrNotFound
	}
	return v, err
}

// ─── OTPStore：实现 otp.Store ─────────────────────────────────

// OTPStore otp 域的存储包装。
type OTPStore struct{ c *Client }

// NewOTPStore 构建。
func NewOTPStore(c *Client) *OTPStore { return &OTPStore{c: c} }

// SaveCode 实现 otp.Store。
func (s *OTPStore) SaveCode(ctx context.Context, key, val string, ttlSeconds int64) error {
	return s.c.setEX(ctx, key, val, ttlSeconds)
}

// GetCode 实现 otp.Store。
func (s *OTPStore) GetCode(ctx context.Context, key string) (string, error) {
	return s.c.get(ctx, key)
}

// DeleteCode 实现 otp.Store。
func (s *OTPStore) DeleteCode(ctx context.Context, key string) error {
	return s.c.rdb.Del(ctx, key).Err()
}

// consumeIfMatchScript Lua 原子「值相等才删除」：防并发同码双过。
var consumeIfMatchScript = redis.NewScript(
	`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`)

// ConsumeIfMatch 实现 otp.Store。
func (s *OTPStore) ConsumeIfMatch(ctx context.Context, key, expect string) (bool, error) {
	n, err := consumeIfMatchScript.Run(ctx, s.c.rdb, []string{key}, expect).Int()
	if err != nil && !errors.Is(err, redis.Nil) {
		return false, err
	}
	return n == 1, nil
}

// Incr 实现 otp.Store。
func (s *OTPStore) Incr(ctx context.Context, key string, ttlSeconds int64) (int64, error) {
	return s.c.incrOnce(ctx, key, ttlSeconds)
}

// RemainingTTL 实现 otp.Store。
func (s *OTPStore) RemainingTTL(ctx context.Context, key string) (int64, error) {
	d, err := s.c.rdb.TTL(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if d < 0 {
		return 0, nil
	}
	return int64(d.Seconds()), nil
}

// ─── ThirdPartyStore：实现 login.ThirdPartyStore ─────────────

// ThirdPartyStore 第三方登录状态包装。
type ThirdPartyStore struct{ c *Client }

// NewThirdPartyStore 构建。
func NewThirdPartyStore(c *Client) *ThirdPartyStore { return &ThirdPartyStore{c: c} }

// SaveState 实现 login.ThirdPartyStore。
func (s *ThirdPartyStore) SaveState(ctx context.Context, state, platform string, ttlSeconds int64) error {
	return s.c.setEX(ctx, "iam:oauth:state:"+state, platform, ttlSeconds)
}

// ConsumeState 实现 login.ThirdPartyStore（一次性）。
func (s *ThirdPartyStore) ConsumeState(ctx context.Context, state string) (string, error) {
	v, err := s.c.getDel(ctx, "iam:oauth:state:"+state)
	if err != nil {
		return "", login.ErrNotFound
	}
	return v, nil
}

// SaveCode 实现 login.ThirdPartyStore（一次性归一身份材料）。
func (s *ThirdPartyStore) SaveCode(ctx context.Context, code string, p *login.ThirdPartyCodePayload, ttlSeconds int64) error {
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return s.c.setEX(ctx, "iam:thirdparty:code:"+code, string(b), ttlSeconds)
}

// ConsumeCode 实现 login.ThirdPartyStore（一次性）。
func (s *ThirdPartyStore) ConsumeCode(ctx context.Context, code string) (login.ThirdPartyCodePayload, error) {
	var p login.ThirdPartyCodePayload
	v, err := s.c.getDel(ctx, "iam:thirdparty:code:"+code)
	if err != nil {
		return p, login.ErrNotFound
	}
	if err := json.Unmarshal([]byte(v), &p); err != nil {
		return p, err
	}
	return p, nil
}

// ─── Client：实现 login.PasswordFailGuard ————————————————————

// Fail 实现 login.PasswordFailGuard：计数达上限时置锁定标记（锁定只拦密码入口）。
func (c *Client) Fail(ctx context.Context, identifier string, maxFails int64) (int64, error) {
	n, err := c.incrOnce(ctx, "iam:pwd:fail:"+identifier, 15*60)
	if err != nil {
		return 0, err
	}
	if maxFails > 0 && n >= maxFails {
		if err := c.setEX(ctx, "iam:pwd:lock:"+identifier, "1", 5*60); err != nil {
			return n, err
		}
	}
	return n, nil
}

// Locked 实现 login.PasswordFailGuard。
func (c *Client) Locked(ctx context.Context, identifier string) (bool, error) {
	n, err := c.rdb.Exists(ctx, "iam:pwd:lock:"+identifier).Result()
	return n > 0, err
}

// ─── Client：实现 session.RevocationStore ──────────────────────

// RevokeJTI 实现 session.RevocationStore：AT 撤销标记，TTL = AT 剩余寿命。
func (c *Client) RevokeJTI(ctx context.Context, jti string, ttlSeconds int64) error {
	return c.setEX(ctx, "iam:session:"+jti, "1", ttlSeconds)
}

// Revoked 实现 session.RevocationStore。
func (c *Client) Revoked(ctx context.Context, jti string) (bool, error) {
	n, err := c.rdb.Exists(ctx, "iam:session:"+jti).Result()
	return n > 0, err
}

// TokenVersion 实现 session.RevocationStore：token_version 缓存（miss 由调用方回源 PG）。
func (c *Client) TokenVersion(ctx context.Context, userID string) (ver int64, ok bool, err error) {
	v, gerr := c.get(ctx, "iam:user:ver:"+userID)
	if gerr != nil {
		return 0, false, nil //nolint:nilerr // 缓存 miss/故障均按未命中处理：降级放行，事实源在 PG
	}
	ver, perr := strconv.ParseInt(v, 10, 64)
	if perr != nil {
		return 0, false, nil //nolint:nilerr // 脏值视同缓存未命中：回源 PG 重建
	}
	return ver, true, nil
}

// SetTokenVersion 实现 session.RevocationStore（TTL 60s）。
func (c *Client) SetTokenVersion(ctx context.Context, userID string, ver, ttlSeconds int64) {
	_ = c.setEX(ctx, "iam:user:ver:"+userID, strconv.FormatInt(ver, 10), ttlSeconds)
}

// SaveUsedRT 实现 session.RevocationStore：已轮换 RT 指纹 → family。
func (c *Client) SaveUsedRT(ctx context.Context, rtHash, familyID string, ttlSeconds int64) error {
	return c.setEX(ctx, "iam:rt:used:"+rtHash, familyID, ttlSeconds)
}

// GetUsedRT 实现 session.RevocationStore。
func (c *Client) GetUsedRT(ctx context.Context, rtHash string) (string, error) {
	v, err := c.rdb.Get(ctx, "iam:rt:used:"+rtHash).Result()
	if errors.Is(err, redis.Nil) {
		return "", session.ErrNotFound
	}
	return v, err
}

// ─── Client：实现 login.ChallengeCounters（触发式策略只读计数）——

// OTPSentFromIP 实现 login.ChallengeCounters。
func (c *Client) OTPSentFromIP(ctx context.Context, ip string) (int64, error) {
	return c.getCount(ctx, "iam:otp:send:ip:"+ip)
}

// OTPSentFromDevice 实现 login.ChallengeCounters。
func (c *Client) OTPSentFromDevice(ctx context.Context, device string) (int64, error) {
	return c.getCount(ctx, "iam:otp:send:device:"+device)
}

// PasswordFailsOf 实现 login.ChallengeCounters。
func (c *Client) PasswordFailsOf(ctx context.Context, identifier string) (int64, error) {
	return c.getCount(ctx, "iam:pwd:fail:"+identifier)
}

func (c *Client) getCount(ctx context.Context, key string) (int64, error) {
	v, err := c.rdb.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(v, 10, 64)
}

// —— 人机验证挑战材料（供 platform/captcha 使用）——

// IncrIssue 挑战签发频控计数（iam:captcha:issue:{ip}|{device}）。
func (c *Client) IncrIssue(ctx context.Context, ip, device string, ttlSeconds int64) (int64, error) {
	return c.incrOnce(ctx, "iam:captcha:issue:"+ip+"|"+device, ttlSeconds)
}

// SaveChallenge 保存挑战秘密材料（一次性）。
func (c *Client) SaveChallenge(ctx context.Context, challengeID, secret string, ttlSeconds int64) error {
	return c.setEX(ctx, "iam:captcha:ch:"+challengeID, secret, ttlSeconds)
}

// GetChallenge 读取挑战答案（不消费；过期/不存在返回 ErrNotFound）。
func (c *Client) GetChallenge(ctx context.Context, challengeID string) (string, error) {
	return c.get(ctx, "iam:captcha:ch:"+challengeID)
}

// DeleteChallenge 删除挑战（尝试超限作废）。
func (c *Client) DeleteChallenge(ctx context.Context, challengeID string) error {
	return c.rdb.Del(ctx, "iam:captcha:ch:"+challengeID).Err()
}

// consumeChallengeScript Lua 原子「答案匹配才删除」：Verify 通过即消费（§4.5 不变量 2）。
var consumeChallengeScript = redis.NewScript(
	`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`)

// ConsumeChallengeIfMatch 通过即原子消费；竞争失败返回 false。
func (c *Client) ConsumeChallengeIfMatch(ctx context.Context, challengeID, expect string) (bool, error) {
	n, err := consumeChallengeScript.Run(ctx, c.rdb, []string{"iam:captcha:ch:" + challengeID}, expect).Int()
	if err != nil && !errors.Is(err, redis.Nil) {
		return false, err
	}
	return n == 1, nil
}

// IncrChallengeAttempts 单挑战尝试计数（§4.5 FailAttemptsExceeded 依据）。
func (c *Client) IncrChallengeAttempts(ctx context.Context, challengeID string, ttlSeconds int64) (int64, error) {
	return c.incrOnce(ctx, "iam:captcha:att:"+challengeID, ttlSeconds)
}

// RecordCaptchaFail 实现 login.CaptchaFailGuard：按 ip/device/identifier 维度计数，
// 任一维度达 maxFails 置锁定（只拦人机验证路径；session 维度留给已登录态挑战）。
func (c *Client) RecordCaptchaFail(ctx context.Context, sc login.SceneContext, maxFails int64) (int64, error) {
	worst := int64(0)
	for _, d := range captchaFailDims(sc) {
		n, err := c.incrOnce(ctx, "iam:captcha:fail:"+d, 15*60)
		if err != nil {
			return worst, err
		}
		if n > worst {
			worst = n
		}
		if maxFails > 0 && n >= maxFails {
			if err := c.setEX(ctx, "iam:captcha:lock:"+d, "1", 5*60); err != nil {
				return worst, err
			}
		}
	}
	return worst, nil
}

// CaptchaLocked 实现 login.CaptchaFailGuard：任一维度锁定即视为锁定。
func (c *Client) CaptchaLocked(ctx context.Context, sc login.SceneContext) (bool, error) {
	for _, d := range captchaFailDims(sc) {
		n, err := c.rdb.Exists(ctx, "iam:captcha:lock:"+d).Result()
		if err != nil {
			return false, err
		}
		if n > 0 {
			return true, nil
		}
	}
	return false, nil
}

// CaptchaFailStore login.CaptchaFailGuard 的包装（Fail 签名与 PasswordFailGuard 冲突，独立包装类型）。
type CaptchaFailStore struct{ c *Client }

// NewCaptchaFailStore 构建。
func NewCaptchaFailStore(c *Client) *CaptchaFailStore { return &CaptchaFailStore{c: c} }

// Fail 实现 login.CaptchaFailGuard。
func (s *CaptchaFailStore) Fail(ctx context.Context, sc login.SceneContext, maxFails int64) (int64, error) {
	return s.c.RecordCaptchaFail(ctx, sc, maxFails)
}

// Locked 实现 login.CaptchaFailGuard。
func (s *CaptchaFailStore) Locked(ctx context.Context, sc login.SceneContext) (bool, error) {
	return s.c.CaptchaLocked(ctx, sc)
}

func captchaFailDims(sc login.SceneContext) []string {
	dims := make([]string, 0, 3)
	if sc.IP != "" {
		dims = append(dims, "ip:"+sc.IP)
	}
	if sc.DeviceID != "" {
		dims = append(dims, "device:"+sc.DeviceID)
	}
	if sc.Identifier != "" {
		dims = append(dims, "ident:"+sc.Identifier)
	}
	return dims
}

var _ login.CaptchaFailGuard = (*CaptchaFailStore)(nil)
