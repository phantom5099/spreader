// Package mail CodeSender 的邮件类实现：console（开发）/ smtp / mail139_bridge。
package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"

	"github.com/phantom5099/spreader/app/identity/internal/otp"
)

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
func (s *SMTP) Send(_ context.Context, to, code string) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: s.cfg.Host})
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer func() { _ = conn.Close() }()
	cl, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer func() { _ = cl.Close() }()
	if ok, _ := cl.Extension("AUTH"); ok { // 探测失败视作不支持 AUTH（后续命令自然报错）
		if aerr := cl.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); aerr != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if merr := cl.Mail(s.cfg.From); merr != nil {
		return err
	}
	if rerr := cl.Rcpt(to); rerr != nil {
		return err
	}
	w, err := cl.Data()
	if err != nil {
		return err
	}
	msg := buildMail(s.cfg.From, to, "您的验证码", codeBody(code))
	if _, err = w.Write(msg); err != nil {
		return err
	}
	if werr := w.Close(); werr != nil {
		return err
	}
	return cl.Quit()
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
func (m *Mail139) Send(_ context.Context, to, code string) error {
	digits := strings.TrimPrefix(to, "+")
	target := digits + "@" + m.domain
	conn, err := tls.Dial("tcp", fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port), &tls.Config{ServerName: m.cfg.Host})
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer func() { _ = conn.Close() }()
	cl, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer func() { _ = cl.Close() }()
	if ok, _ := cl.Extension("AUTH"); ok { // 探测失败视作不支持 AUTH（后续命令自然报错）
		if aerr := cl.Auth(smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)); aerr != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if merr := cl.Mail(m.cfg.From); merr != nil {
		return err
	}
	if rerr := cl.Rcpt(target); rerr != nil {
		return err
	}
	w, err := cl.Data()
	if err != nil {
		return err
	}
	// 验证码放标题：139 免费短信提醒只展示约 140 字摘要，标题直达。
	msg := buildMail(m.cfg.From, target, fmt.Sprintf("验证码 %s", code), codeBody(code))
	if _, err = w.Write(msg); err != nil {
		return err
	}
	if werr := w.Close(); werr != nil {
		return err
	}
	return cl.Quit()
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
