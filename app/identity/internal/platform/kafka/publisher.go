// Package kafka 事件发布与审计消费：跨服务状态推进走领域事件。
// 发布永不阻塞登录（实现内吞错并记日志）；login_audit 经 Kafka 异步批量入库，不占登录路径。
package kafka

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/segmentio/kafka-go"

	"github.com/phantom5099/spreader/app/identity/internal/login"
	"github.com/phantom5099/spreader/app/identity/internal/platform/metrics"
)

// 主题：消费方 = 通知/信息流/搜索/风控/realtime。
const (
	TopicUserCreated    = "iam.user.created"
	TopicLoginSucceeded = "iam.login.succeeded"
	TopicLoginFailed    = "iam.login.failed"
	TopicSessionRevoked = "iam.session.revoked"
)

type event struct {
	Event      string `json:"event"`
	UserID     string `json:"user_id,omitempty"`
	SessionID  string `json:"session_id,omitempty"`
	FamilyID   string `json:"family_id,omitempty"`
	LoginType  string `json:"login_type,omitempty"`
	Identifier string `json:"identifier_masked,omitempty"`
	Result     string `json:"result,omitempty"`
	Reason     string `json:"reason,omitempty"`
	IP         string `json:"ip,omitempty"`
	DeviceID   string `json:"device_id,omitempty"`

	CaptchaChallengeID string `json:"captcha_challenge_id,omitempty"`
	CaptchaKind        string `json:"captcha_kind,omitempty"`
	CaptchaResult      string `json:"captcha_result,omitempty"`

	TS int64 `json:"ts"`
}

// Publisher login.EventPublisher / session.Events 的 Kafka 实现。
type Publisher struct {
	w   *kafka.Writer
	log *slog.Logger
}

// NewPublisher 创建写入器（自动建主题；开发期 KRaft 单机即可）。
func NewPublisher(brokers []string, log *slog.Logger) *Publisher {
	return &Publisher{
		w: &kafka.Writer{
			Addr:                   kafka.TCP(brokers...),
			Balancer:               &kafka.RoundRobin{},
			AllowAutoTopicCreation: true,
			BatchTimeout:           50 * time.Millisecond,
			RequiredAcks:           kafka.RequireOne,
		},
		log: log,
	}
}

// Close 释放写入器。
func (p *Publisher) Close() error { return p.w.Close() }

// publish 吞错发布：事件链路故障不扩大为登录故障。
func (p *Publisher) publish(ctx context.Context, topic string, e *event) {
	e.TS = time.Now().Unix()
	v, err := json.Marshal(e)
	if err != nil {
		p.log.Error("kafka marshal", "topic", topic, "err", err)
		return
	}
	pctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	if err := p.w.WriteMessages(pctx, kafka.Message{Topic: topic, Value: v}); err != nil {
		p.log.Error("kafka publish", "topic", topic, "err", err)
	}
}

// UserCreated 实现 login.EventPublisher：消费方=通知服务/信息流/搜索。
func (p *Publisher) UserCreated(ctx context.Context, userID string) {
	metrics.BusinessEvent("user.created", "")
	p.publish(ctx, TopicUserCreated, &event{
		Event:  "user.created",
		UserID: userID,
	})
}

// LoginSucceeded 实现 login.EventPublisher：消费方=风控/通知（新设备提醒）。
func (p *Publisher) LoginSucceeded(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.succeeded", e.Reason)
	p.publish(ctx, TopicLoginSucceeded, &event{
		Event:              "login.succeeded",
		UserID:             e.UserID,
		LoginType:          e.LoginType,
		Identifier:         e.IdentifierMasked,
		Result:             e.Result,
		Reason:             e.Reason,
		IP:                 e.IP,
		DeviceID:           e.DeviceID,
		CaptchaChallengeID: e.Captcha.ChallengeID,
		CaptchaKind:        e.Captcha.Kind,
		CaptchaResult:      e.Captcha.Result,
	})
}

// LoginFailed 实现 login.EventPublisher：消费方=风控/告警（爆破识别，封禁联动输入）。
func (p *Publisher) LoginFailed(ctx context.Context, e *login.LoginEvent) {
	metrics.BusinessEvent("login.failed", e.Reason)
	p.publish(ctx, TopicLoginFailed, &event{
		Event:              "login.failed",
		UserID:             e.UserID,
		LoginType:          e.LoginType,
		Identifier:         e.IdentifierMasked,
		Result:             e.Result,
		Reason:             e.Reason,
		IP:                 e.IP,
		DeviceID:           e.DeviceID,
		CaptchaChallengeID: e.Captcha.ChallengeID,
		CaptchaKind:        e.Captcha.Kind,
		CaptchaResult:      e.Captcha.Result,
	})
}

// SessionRevoked 实现 login.EventPublisher / session.Events：realtime 关长连接。
func (p *Publisher) SessionRevoked(ctx context.Context, userID, sessionID, familyID, reason string) {
	metrics.BusinessEvent("session.revoked", reason)
	p.publish(ctx, TopicSessionRevoked, &event{
		Event:     "session.revoked",
		UserID:    userID,
		SessionID: sessionID,
		FamilyID:  familyID,
		Reason:    reason,
	})
}
