package kafka

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/segmentio/kafka-go"
)

// AuditRow 审计行投影（消费方自定义，与 postgres.WriteLoginAudit 的入参一一对应）。
// identifier 已由发布方脱敏：完整手机号/邮箱不进事件与审计表。
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

// AuditWriter 审计批量写入（由 platform/postgres 实现，cmd/ 注入）。
type AuditWriter interface {
	WriteLoginAudit(ctx context.Context, rows []AuditRow) error
}

// AuditConsumer login.succeeded / login.failed → login_audit 异步批量入库。
type AuditConsumer struct {
	readers []*kafka.Reader
	write   AuditWriter
	log     *slog.Logger
	batch   int
	flush   time.Duration
}

// NewAuditConsumer 订阅 succeeded/failed 两个主题（组内共享 group id）。
func NewAuditConsumer(brokers []string, group string, write AuditWriter, log *slog.Logger) *AuditConsumer {
	mk := func(topic string) *kafka.Reader {
		return kafka.NewReader(kafka.ReaderConfig{
			Brokers:  brokers,
			GroupID:  group,
			Topic:    topic,
			MinBytes: 1,
			MaxBytes: 10e6,
			MaxWait:  500 * time.Millisecond,
		})
	}
	return &AuditConsumer{
		readers: []*kafka.Reader{mk(TopicLoginSucceeded), mk(TopicLoginFailed)},
		write:   write,
		log:     log,
		batch:   100,
		flush:   time.Second,
	}
}

// Run 阻塞消费直到 ctx 取消；批量写入，写库失败保留缓冲下轮重试。
// 写库使用 WithoutCancel 的派生 ctx：ctx 取消（关服）后仍要把缓冲区最后一批写完再退，
// 否则服务生命周期 context 的取消会让终局 flush 报 context canceled、丢最后一批审计。
func (c *AuditConsumer) Run(ctx context.Context) {
	wctx := context.WithoutCancel(ctx) // 继承 values（保留未来 trace 字段），脱离取消信号
	rows := make([]AuditRow, 0, c.batch)
	t := time.NewTicker(c.flush)
	defer t.Stop()
	flush := func() {
		if len(rows) == 0 {
			return
		}
		if err := c.write.WriteLoginAudit(wctx, rows); err != nil {
			c.log.Error("audit batch insert", "err", err, "rows", len(rows))
			return // 不清空缓冲：下轮随新消息一起重试
		}
		rows = rows[:0]
	}
	for {
		for _, r := range c.readers {
			m, err := r.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					flush()
					return
				}
				c.log.Error("audit fetch", "err", err)
				continue
			}
			var e event
			if err := json.Unmarshal(m.Value, &e); err != nil {
				c.log.Error("audit unmarshal", "err", err)
			} else {
				rows = append(rows, AuditRow{
					UserID:             e.UserID,
					LoginType:          e.LoginType,
					IdentifierMasked:   e.Identifier,
					Result:             e.Result,
					Reason:             e.Reason,
					IP:                 e.IP,
					DeviceID:           e.DeviceID,
					CaptchaChallengeID: e.CaptchaChallengeID,
					CaptchaKind:        e.CaptchaKind,
					CaptchaResult:      e.CaptchaResult,
				})
			}
			if err := r.CommitMessages(ctx, m); err != nil {
				c.log.Error("audit commit", "err", err)
			}
			if len(rows) >= c.batch {
				flush()
			}
		}
		select {
		case <-ctx.Done():
			flush()
			return
		case <-t.C:
			flush()
		default:
			time.Sleep(20 * time.Millisecond) // 避免双 reader 空转打满 CPU
		}
	}
}
