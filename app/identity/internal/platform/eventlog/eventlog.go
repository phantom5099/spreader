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
	_ login.EventSink = (*Sink)(nil)
	_ session.Events  = (*Sink)(nil)
)

// Sink login.EventSink / session.Events 的实现：事件的终点。
// 不承诺投递——没有队列、没有重发、没有 ack，所以不叫 Publisher。
type Sink struct {
	log   *slog.Logger
	audit AuditWriter
}

// NewSink audit 为 nil 时只输出日志与指标（登录编排单测的默认形态）。
func NewSink(log *slog.Logger, audit AuditWriter) *Sink {
	return &Sink{log: log, audit: audit}
}

// UserCreated 实现 login.EventSink（设计上供通知/信息流/搜索消费，均未上线）。
func (s *Sink) UserCreated(_ context.Context, userID string) {
	metrics.BusinessEvent("user.created", "")
	s.log.Info("user.created", "user_id", userID)
}

// LoginSucceeded 实现 login.EventSink。
func (s *Sink) LoginSucceeded(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.succeeded", e.Reason)
	s.log.Info("login.succeeded",
		"user_id", e.UserID, "login_type", e.LoginType,
		"identifier_masked", e.IdentifierMasked, "ip", e.IP, "device_id", e.DeviceID)
	s.writeAudit(ctx, e)
}

// LoginFailed 实现 login.EventSink：被锁定/爆破的信号来源。
func (s *Sink) LoginFailed(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.failed", e.Reason)
	s.log.Info("login.failed",
		"user_id", e.UserID, "login_type", e.LoginType, "reason", e.Reason,
		"identifier_masked", e.IdentifierMasked, "ip", e.IP, "device_id", e.DeviceID)
	s.writeAudit(ctx, e)
}

// SessionRevoked 实现 session.Events（设计上供 realtime 关长连接，未上线）。
func (s *Sink) SessionRevoked(_ context.Context, userID, sessionID, familyID, reason string) {
	metrics.BusinessEvent("session.revoked", reason)
	s.log.Info("session.revoked",
		"user_id", userID, "session_id", sessionID, "family_id", familyID, "reason", reason)
}

// writeAudit 审计失败不阻断登录，但必须可观测：静默吞错正是上一版丢数据的原因。
// 用脱离取消信号的有界 ctx：客户端断开不该把已发生的登录事实从审计里抹掉。
// 这是同步调用（上界 auditWriteTimeout），登录路径会等它返回；换回异步投递才有
// 旧注释说的「不阻塞」，现在只能说「有界」。
func (s *Sink) writeAudit(ctx context.Context, e *login.LoginEvent) {
	if s.audit == nil || e == nil {
		return
	}
	actx, cancel := context.WithTimeout(context.WithoutCancel(ctx), auditWriteTimeout)
	defer cancel()
	err := s.audit.WriteLoginAudit(actx, []AuditRow{{
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
		s.log.Error("login audit write", "err", err)
	}
}
