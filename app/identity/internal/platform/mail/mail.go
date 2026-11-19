// Package mail CodeSender 的邮件类实现：console（开发）/ smtp / mail139_bridge。
package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/otp"
)

// smtpTimeout 覆盖拨号与会话：smtp 命令本身不接收 ctx，只能靠连接 deadline 兜底。
// 必须显著小于 SendOtp 的路由预算（login.budgetExternal 8s）：主备通道各占一次，
// 超时值比路由预算还宽就永远不会触发，只会让整条请求被外层统一截断。
const smtpTimeout = 3 * time.Second

// Console 开发通道：验证码打印到日志（dev.* 路由默认）。
type Console struct{ Log *slog.Logger }

// Send 实现 otp.Sender。
func (c *Console) Send(_ context.Context, to, code string) error {
	c.Log.Info("otp console sender", "to", to, "code", code)
	return nil
}

// SMTPConfig SMTP 连接参数（凭据走 env）。
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// SMTP QQ/163 免费SMTP 通道（隐式 TLS 465）。
type SMTP struct {
	cfg SMTPConfig
}

// NewSMTP 构建；端口 465 走隐式 TLS。
func NewSMTP(cfg SMTPConfig) *SMTP { return &SMTP{cfg: cfg} }

// Send 实现 otp.Sender。
func (s *SMTP) Send(ctx context.Context, to, code string) error {
	if err := sendSMTP(ctx, s.cfg, to, "您的验证码", codeBody(code)); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return nil
}

// Mail139 139 邮箱桥：目标 = <E.164去掉+号的手机号>@139.com；验证码放邮件标题。
// 免费版到达形式为邮件短信提醒（约 140 字摘要、限移动号段）。
type Mail139 struct {
	cfg    SMTPConfig
	domain string // 139.com
}

// NewMail139 构建。
func NewMail139(cfg SMTPConfig, domain string) *Mail139 {
	return &Mail139{cfg: cfg, domain: domain}
}

// Send 实现 otp.Sender。to 为 E.164 手机号。
func (m *Mail139) Send(ctx context.Context, to, code string) error {
	target := strings.TrimPrefix(to, "+") + "@" + m.domain
	// 验证码放标题：139 免费短信提醒只展示约 140 字摘要，标题直达。
	if err := sendSMTP(ctx, m.cfg, target, fmt.Sprintf("验证码 %s", code), codeBody(code)); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return nil
}

// sendSMTP 拨号、认证并投递一封纯文本邮件；任何一步失败都必须向上返回，不能吞成成功。
func sendSMTP(ctx context.Context, cfg SMTPConfig, to, subject, body string) error {
	d := &tls.Dialer{
		Config:    &tls.Config{ServerName: cfg.Host},
		NetDialer: &net.Dialer{Timeout: smtpTimeout},
	}
	conn, err := d.DialContext(ctx, "tcp", fmt.Sprintf("%s:%d", cfg.Host, cfg.Port))
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer func() { _ = conn.Close() }()
	if derr := conn.SetDeadline(time.Now().Add(smtpTimeout)); derr != nil {
		return fmt.Errorf("set deadline: %w", derr)
	}

	cl, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return fmt.Errorf("client: %w", err)
	}
	defer func() { _ = cl.Close() }()
	if ok, _ := cl.Extension("AUTH"); ok { // 探测失败视作不支持 AUTH（后续命令自然报错）
		if aerr := cl.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); aerr != nil {
			return fmt.Errorf("auth: %w", aerr)
		}
	}
	if merr := cl.Mail(cfg.From); merr != nil {
		return fmt.Errorf("mail from: %w", merr)
	}
	if rerr := cl.Rcpt(to); rerr != nil {
		return fmt.Errorf("rcpt to: %w", rerr)
	}
	w, err := cl.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err = w.Write(buildMail(cfg.From, to, subject, body)); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if werr := w.Close(); werr != nil {
		return fmt.Errorf("close body: %w", werr)
	}
	if qerr := cl.Quit(); qerr != nil {
		return fmt.Errorf("quit: %w", qerr)
	}
	return nil
}

func buildMail(from, to, subject, body string) []byte {
	return []byte(strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n"))
}

func codeBody(code string) string {
	return fmt.Sprintf("您的验证码是 %s，%d 分钟内有效。若非本人操作请忽略。", code, 5)
}

var _ otp.Sender = (*Console)(nil)
var _ otp.Sender = (*SMTP)(nil)
var _ otp.Sender = (*Mail139)(nil)
