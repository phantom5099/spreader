package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// write 写一个临时配置文件，返回路径。
func write(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

// 嵌套键必须按 yaml tag 精确匹配：曾经 metrics.addr 与 tag metrics_addr 对不上，
// 配置被静默忽略、进程一直用回环地址，容器里的 Prometheus 抓不到。
func TestLoadNestedKeys(t *testing.T) {
	p := write(t, t.TempDir(), "c.yaml", `
server:
  http_addr: 0.0.0.0:8000
  request_timeout_seconds: 7
metrics:
  addr: 0.0.0.0:9100
`)
	cfg, err := Load(p)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Metrics.Addr != "0.0.0.0:9100" {
		t.Errorf("metrics.addr = %q, want 0.0.0.0:9100", cfg.Metrics.Addr)
	}
	if cfg.Server.HTTPAddr != "0.0.0.0:8000" {
		t.Errorf("server.http_addr = %q", cfg.Server.HTTPAddr)
	}
	if cfg.Server.RequestTimeoutSeconds != 7 {
		t.Errorf("server.request_timeout_seconds = %d, want 7", cfg.Server.RequestTimeoutSeconds)
	}
}

// base 只覆盖声明的键：未提及的继承，映射逐键合并（兄弟键保留），列表整体替换，
// 0 是有效赋值而不是「没写」。
func TestLoadMergesBase(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "base.yaml", `
server:
  http_addr: 127.0.0.1:8000
login:
  disabled_types: [phone_otp, email_otp]
otp:
  daily_limit: 20
  per_ip_per_hour: 10
  global_per_minute: 100
  channels:
    login.phone: { primary: mail139_bridge, fallback: cloud_sms }
    login.email: { primary: smtp, fallback: console }
`)
	p := write(t, dir, "overlay.yaml", `
base: base.yaml
login:
  disabled_types: [password]
otp:
  per_ip_per_hour: 0
  channels:
    login.phone: { primary: console, fallback: console }
metrics:
  addr: 0.0.0.0:9100
`)

	cfg, err := Load(p)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.OTP.PerIPPerHour != 0 {
		t.Errorf("per_ip_per_hour = %d, want 0（0 必须是有效覆盖）", cfg.OTP.PerIPPerHour)
	}
	if cfg.OTP.GlobalPerMinute != 100 || cfg.OTP.DailyLimit != 20 {
		t.Errorf("未覆盖的键没继承：global=%d daily=%d", cfg.OTP.GlobalPerMinute, cfg.OTP.DailyLimit)
	}
	if cfg.Server.HTTPAddr != "127.0.0.1:8000" {
		t.Errorf("http_addr = %q，应继承 base", cfg.Server.HTTPAddr)
	}
	if got := cfg.Login.DisabledTypes; len(got) != 1 || got[0] != "password" {
		t.Errorf("disabled_types = %v，列表应整体替换而非逐元素合并", got)
	}
	if r := cfg.OTP.Channels["login.phone"]; r.Primary != "console" || r.Fallback != "console" {
		t.Errorf("login.phone = %+v，映射应逐键覆盖", r)
	}
	if r := cfg.OTP.Channels["login.email"]; r.Primary != "smtp" {
		t.Errorf("login.email = %+v，未覆盖的兄弟键应保留", r)
	}
	if cfg.Metrics.Addr != "0.0.0.0:9100" {
		t.Errorf("metrics.addr = %q", cfg.Metrics.Addr)
	}
}

func TestLoadBaseErrors(t *testing.T) {
	dir := t.TempDir()
	missing := write(t, dir, "missing.yaml", "base: nope.yaml\n")

	if _, err := Load(missing); err == nil || !strings.Contains(err.Error(), "read config") {
		t.Errorf("缺失 base 应报 read config，得到 %v", err)
	}

	write(t, dir, "b.yaml", "base: a.yaml\n")
	a := write(t, dir, "a.yaml", "base: b.yaml\n")
	if _, err := Load(a); err == nil || !strings.Contains(err.Error(), "too deep") {
		t.Errorf("base 成环应报 too deep，得到 %v", err)
	}
}

// 仓库里那份压测 profile 的用途就是「不发真短信/邮件、不被自己限流」：
// 这两点一旦被改回去，压测会真的产生费用且结论失真。
func TestLoadTestProfileOpensLimits(t *testing.T) {
	cfg, err := Load(filepath.Join("..", "..", "configs", "server.loadtest.yaml"))
	if err != nil {
		t.Fatalf("Load loadtest profile: %v", err)
	}
	if cfg.Server.HTTPAddr == "" || cfg.Database.DSNEnv == "" {
		t.Fatal("base 未生效：基础配置项缺失")
	}
	if cfg.Metrics.Addr != "0.0.0.0:9100" {
		t.Errorf("metrics.addr = %q，容器内采集需要 0.0.0.0", cfg.Metrics.Addr)
	}
	for scene, r := range cfg.OTP.Channels {
		// fallback 允许为空（= 无备通道），但只要写了就必须也是 console。
		if r.Primary != "console" || (r.Fallback != "" && r.Fallback != "console") {
			t.Errorf("channel %s = %+v，压测不得走真实通道", scene, r)
		}
	}
	if cfg.OTP.PerIPPerHour != 0 || cfg.OTP.PerDevicePerHour != 0 || cfg.OTP.GlobalPerMinute != 0 {
		t.Errorf("OTP 限额未放行：ip=%d device=%d global=%d",
			cfg.OTP.PerIPPerHour, cfg.OTP.PerDevicePerHour, cfg.OTP.GlobalPerMinute)
	}
}
