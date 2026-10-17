// Package captcha HumanVerifier 与 ChallengePolicy 的实现：none / selfhosted 算式挑战。
// 「何时验」= Policy（场景阈值），「怎么验」= Verifier（按 Kind）；按场景定档，不做失败升级难度。
package captcha

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/platform/redis"
)

// None 无挑战实现：配置关闭触发阈值时使用；Verify 恒通过。
type None struct{}

// Kind 实现 login.HumanVerifier。
func (None) Kind() login.CaptchaKind { return login.CaptchaKindNone }

// Issue 实现 login.HumanVerifier。
func (None) Issue(context.Context, *login.ChallengeRequest) (*login.Challenge, error) {
	return nil, login.ErrCaptchaNotSupported
}

// Verify 实现 login.HumanVerifier。
func (None) Verify(context.Context, *login.ChallengeResponse) (*login.ChallengeResult, error) {
	return &login.ChallengeResult{Passed: true}, nil
}

// Selfhosted 自托管算式挑战：Payload=题目文本（**答案绝不在内**），
// 答案只存服务端（Redis 短 TTL）；单挑战尝试上限；签发受 IP 频控。
type Selfhosted struct {
	store          *redis.Client
	ttlSec         int64
	issuePerIPHour int64 // 签发频控：iam:captcha:issue:{ip}|{device}
	maxAttempts    int   // 单挑战尝试上限 → FailAttemptsExceeded
}

// NewSelfhosted 构建。
func NewSelfhosted(store *redis.Client, ttlSec, issuePerIPHour int64) *Selfhosted {
	if ttlSec <= 0 {
		ttlSec = 300
	}
	return &Selfhosted{store: store, ttlSec: ttlSec, issuePerIPHour: issuePerIPHour, maxAttempts: 5}
}

// Kind 实现 login.HumanVerifier。
func (s *Selfhosted) Kind() login.CaptchaKind { return login.CaptchaKindSelfhosted }

// Issue 实现 login.HumanVerifier：算式题下发（答案服务端持有），签发计数。
func (s *Selfhosted) Issue(ctx context.Context, req *login.ChallengeRequest) (*login.Challenge, error) {
	if s.issuePerIPHour > 0 && req.ClientIP != "" {
		if n, err := s.store.IncrIssue(ctx, req.ClientIP, req.DeviceID, 3600); err == nil && n > s.issuePerIPHour {
			return nil, login.ETooManyAttempts()
		}
	}
	a, b := randInt(99), randInt(99)
	id := randHex(16)
	if err := s.store.SaveChallenge(ctx, id, fmt.Sprintf("%d", a+b), s.ttlSec); err != nil {
		return nil, err
	}
	return &login.Challenge{
		ChallengeID: id,
		Kind:        login.CaptchaKindSelfhosted,
		Payload:     []byte(fmt.Sprintf("%d+%d=?", a, b)), // 题目，答案绝不在内
		ExpiresAt:   time.Now().Add(time.Duration(s.ttlSec) * time.Second).Unix(),
	}, nil
}

// Verify 实现 login.HumanVerifier：返回带 FailReason 分类的判定结果；通过才原子消费。
func (s *Selfhosted) Verify(ctx context.Context, resp *login.ChallengeResponse) (*login.ChallengeResult, error) {
	if resp.ChallengeID == "" || len(resp.Answer) == 0 {
		return failResult(login.FailWrongAnswer), nil
	}
	stored, err := s.store.GetChallenge(ctx, resp.ChallengeID)
	if err != nil { // 不存在/过期：业务失败结果而非错误
		return failResult(login.FailExpired), nil //nolint:nilerr // 过期是判定结果，不是基础设施故障
	}
	if n, err := s.store.IncrChallengeAttempts(ctx, resp.ChallengeID, s.ttlSec); err == nil && int(n) > s.maxAttempts {
		_ = s.store.DeleteChallenge(ctx, resp.ChallengeID)
		return failResult(login.FailAttemptsExceeded), nil
	}
	if strings.EqualFold(strings.TrimSpace(string(resp.Answer)), stored) {
		// 通过即 Lua 原子消费；竞争失败按过期处理。
		ok, err := s.store.ConsumeChallengeIfMatch(ctx, resp.ChallengeID, stored)
		if err != nil {
			return nil, err
		}
		if !ok {
			return failResult(login.FailExpired), nil
		}
		return &login.ChallengeResult{Passed: true}, nil
	}
	return failResult(login.FailWrongAnswer), nil
}

func failResult(reason login.CaptchaFailReason) *login.ChallengeResult {
	retryable := reason != login.FailExpired && reason != login.FailAttemptsExceeded
	return &login.ChallengeResult{Passed: false, FailReason: reason, Retryable: retryable}
}

// Policy 触发式策略：命中任一阈值即要求挑战（阈值 0 = 该维度不触发）。
type Policy struct {
	cfg      PolicyCfg
	counters login.ChallengeCounters
}

// PolicyCfg 阈值。
type PolicyCfg struct {
	OTPSendPerIPPerHour     int64
	OTPSendPerDevicePerHour int64
	LoginFailPerAccount     int64
}

// NewPolicy 构建。
func NewPolicy(cfg PolicyCfg, counters login.ChallengeCounters) *Policy {
	return &Policy{cfg: cfg, counters: counters}
}

// Evaluate 实现 login.ChallengePolicy。
func (p *Policy) Evaluate(ctx context.Context, sc login.SceneContext) (bool, error) {
	if sc.Scene == login.SceneOTPSend {
		if p.cfg.OTPSendPerIPPerHour > 0 && sc.IP != "" {
			if n, err := p.counters.OTPSentFromIP(ctx, sc.IP); err == nil && n > p.cfg.OTPSendPerIPPerHour {
				return true, nil
			}
		}
		if p.cfg.OTPSendPerDevicePerHour > 0 && sc.DeviceID != "" {
			if n, err := p.counters.OTPSentFromDevice(ctx, sc.DeviceID); err == nil && n > p.cfg.OTPSendPerDevicePerHour {
				return true, nil
			}
		}
		return false, nil
	}
	if p.cfg.LoginFailPerAccount > 0 && sc.Identifier != "" {
		if n, err := p.counters.PasswordFailsOf(ctx, sc.Identifier); err == nil && n >= p.cfg.LoginFailPerAccount {
			return true, nil
		}
	}
	return false, nil
}

func randInt(limit int) int {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return int(b[0])<<8%(limit+1) + int(b[1])%(limit+1)
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var (
	_ login.HumanVerifier   = None{}
	_ login.HumanVerifier   = (*Selfhosted)(nil)
	_ login.ChallengePolicy = (*Policy)(nil)
)
