// Package eventlog 事件出口：领域事件 → 结构化日志 + 登录审计同步落库。
package eventlog

import (
	"context"
	"log/slog"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/session"
	"github.com/phantom5099/spreader/app/platform/metrics"
)

// auditWriteTimeout 审计写入上界：正常 <1ms，超时只做兜底，不让慢库拖住登录。
const auditWriteTimeout = 2 * time.Second

// AuditRow 审计行投影（与 postgres.LoginAuditRow 一一对应，cmd/ 负责转换）。
type AuditRow struct {
	UserID             string
	LoginType          string
	IdentifierMasked   string
	Result             string
	Reason             string
	IP                 string
	DeviceID           string
	CaptchaChallengeID string
	CaptchaKind        string
	CaptchaResult      string
}

// AuditWriter login_audit 写入（postgres 实现，cmd/ 注入）。
type AuditWriter interface {
	WriteLoginAudit(ctx context.Context, rows []AuditRow) error
}

var (
	_ login.EventPublisher = (*Publisher)(nil)
	_ session.Events       = (*Publisher)(nil)
)

// Publisher login.EventPublisher / session.Events 的实现。
type Publisher struct {
	log   *slog.Logger
	audit AuditWriter
}

// NewPublisher audit 为 nil 时只输出日志与指标（登录编排单测的默认形态）。
func NewPublisher(log *slog.Logger, audit AuditWriter) *Publisher {
	return &Publisher{log: log, audit: audit}
}

// UserCreated 实现 login.EventPublisher（设计上供通知/信息流/搜索消费，均未上线）。
func (p *Publisher) UserCreated(_ context.Context, userID string) {
	metrics.BusinessEvent("user.created", "")
	p.log.Info("user.created", "user_id", userID)
}

// LoginSucceeded 实现 login.EventPublisher。
func (p *Publisher) LoginSucceeded(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.succeeded", e.Reason)
	p.log.Info("login.succeeded",
		"user_id", e.UserID, "login_type", e.LoginType,
		"identifier_masked", e.IdentifierMasked, "ip", e.IP, "device_id", e.DeviceID)
	p.writeAudit(ctx, e)
}

// LoginFailed 实现 login.EventPublisher：被锁定/爆破的信号来源。
func (p *Publisher) LoginFailed(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.failed", e.Reason)
	p.log.Info("login.failed",
		"user_id", e.UserID, "login_type", e.LoginType, "reason", e.Reason,
		"identifier_masked", e.IdentifierMasked, "ip", e.IP, "device_id", e.DeviceID)
	p.writeAudit(ctx, e)
}

// SessionRevoked 实现 session.Events（设计上供 realtime 关长连接，未上线）。
func (p *Publisher) SessionRevoked(_ context.Context, userID, sessionID, familyID, reason string) {
	metrics.BusinessEvent("session.revoked", reason)
	p.log.Info("session.revoked",
		"user_id", userID, "session_id", sessionID, "family_id", familyID, "reason", reason)
}

// writeAudit 审计失败不阻断登录，但必须可观测：静默吞错正是上一版丢数据的原因。
// 用脱离取消信号的有界 ctx：客户端断开不该把已发生的登录事实从审计里抹掉。
func (p *Publisher) writeAudit(ctx context.Context, e *login.LoginEvent) {
	if p.audit == nil || e == nil {
		return
	}
	actx, cancel := context.WithTimeout(context.WithoutCancel(ctx), auditWriteTimeout)
	defer cancel()
	err := p.audit.WriteLoginAudit(actx, []AuditRow{{
		UserID:             e.UserID,
		LoginType:          e.LoginType,
		IdentifierMasked:   e.IdentifierMasked,
		Result:             e.Result,
		Reason:             e.Reason,
		IP:                 e.IP,
		DeviceID:           e.DeviceID,
		CaptchaChallengeID: e.Captcha.ChallengeID,
		CaptchaKind:        e.Captcha.Kind,
		CaptchaResult:      e.Captcha.Result,
	}})
	if err != nil {
		metrics.BusinessEvent("login.audit_write_failed", "")
		p.log.Error("login audit write", "err", err)
	}
}
