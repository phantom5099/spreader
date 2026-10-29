// Package config identity 服务的运行配置装载（跨域设施）。
// 非敏感项入库存 *.example.yaml；一切凭据走 *_env 引用（仓库零秘密）。
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config 顶层配置。
type Config struct {
	Server struct {
		HTTPAddr string `yaml:"http_addr"` // HTTP 监听地址
		// 单请求总预算上界（秒）。这是最后防线：各路由在 handler 内按自身依赖收窄，
		// 此处只保证没有任何请求能无限挂住。0 取内置兜底 10s。
		RequestTimeoutSeconds int64 `yaml:"request_timeout_seconds"`
	}
	Metrics struct {
		Addr string `yaml:"addr"` // 管理端点（/metrics + pprof）；Prometheus 容器采集时需 0.0.0.0
	}
	Login struct {
		DisabledTypes []string `yaml:"disabled_types"` // 停用的登录方式（phone_otp/email_otp/password/thirdparty）
	}
	Database struct {
		DSNEnv string `yaml:"dsn_env"` // 真实 DSN 走环境变量
	}
	Redis struct {
		Mode       string   `yaml:"mode"`        // standalone | cluster | sentinel
		Addrs      []string `yaml:"addrs"`       // standalone 1 个；cluster/sentinel 填全部节点
		MasterName string   `yaml:"master_name"` // 仅 sentinel 必填
		Password   string   `yaml:"password"`
		DB         int      `yaml:"db"` // cluster 模式仅支持 0
	}
	JWT struct {
		SecretEnv string `yaml:"secret_env"` // HS256 签名密钥
		ATTTLSec  int64  `yaml:"at_ttl_seconds"`
		RTTTLSec  int64  `yaml:"rt_ttl_seconds"`
	}
	OTP struct {
		TTLSeconds       int64                   `yaml:"ttl_seconds"`
		CodeLength       int                     `yaml:"code_length"`
		CooldownSeconds  int64                   `yaml:"cooldown_seconds"`
		DailyLimit       int64                   `yaml:"daily_limit"`
		PerIPPerHour     int64                   `yaml:"per_ip_per_hour"`
		PerDevicePerHour int64                   `yaml:"per_device_per_hour"`
		GlobalPerMinute  int64                   `yaml:"global_per_minute"`
		PepperEnv        string                  `yaml:"pepper_env"`
		Channels         map[string]ChannelRoute `yaml:"channels"` // login.phone / login.email
	}
	Password struct {
		MaxFails      int64  `yaml:"max_fails"`
		FailWindowSec int64  `yaml:"fail_window_seconds"`
		LockSec       int64  `yaml:"lock_seconds"`
		PepperEnv     string `yaml:"pepper_env"`
	}
	ThirdParty struct {
		AllowInsecureProviders bool       `yaml:"allow_insecure_providers"` // true 仅限非生产环境（mock 双闸之一）
		Mock                   MockConfig `yaml:"mock"`
	}
	Captcha struct {
		Verifier          string       `yaml:"verifier"` // none | selfhosted
		ChallengeTTLSec   int64        `yaml:"challenge_ttl_seconds"`
		IssuePerIPPerHour int64        `yaml:"issue_per_ip_per_hour"` // 挑战签发频控
		MaxFails          int64        `yaml:"max_fails"`             // 失败锁定阈值（与密码共用阈值语义）
		Policy            PolicyConfig `yaml:"policy"`
	}
	Mail struct {
		SMTP struct {
			Host        string `yaml:"host"`
			Port        int    `yaml:"port"`
			UsernameEnv string `yaml:"username_env"`
			PasswordEnv string `yaml:"password_env"`
			From        string `yaml:"from"`
		} `yaml:"smtp"`
		Mail139 struct {
			Domain string `yaml:"domain"` // 目标 = <E.164去掉+号>@139.com；验证码放邮件标题
		} `yaml:"mail139"`
	}
	SMS struct {
		CloudSMS struct {
			Provider      string `yaml:"provider"` // tencent
			SecretIDEnv   string `yaml:"secret_id_env"`
			SecretKeyEnv  string `yaml:"secret_key_env"`
			SdkAppIDEnv   string `yaml:"sdk_app_id_env"`
			SignName      string `yaml:"sign_name"`
			TemplateIDEnv string `yaml:"template_id_env"`
		} `yaml:"cloud_sms"`
	}
}

// ChannelRoute 单场景的通道链（主 → 备）。
type ChannelRoute struct {
	Primary  string `yaml:"primary"`
	Fallback string `yaml:"fallback"`
}

// MockConfig mock 第三方平台（wechat_mock）。
type MockConfig struct {
	AppID          string   `yaml:"appid"`           // 固定 mock appid
	ExternalIDPool []string `yaml:"openid_pool"`     // 空=每次授权随机派生 mock_ 前缀；非空=池内确定分配（可重复测试）
	PublicBaseURL  string   `yaml:"public_base_url"` // mock 授权页对外地址（identity 服务自身）
}

// PolicyConfig 触发式人机校验阈值（决定"何时验"，与 verifier 解耦；0 = 不触发）。
type PolicyConfig struct {
	OTPSendPerIPPerHour     int64 `yaml:"otp_send_per_ip_per_hour"`
	OTPSendPerDevicePerHour int64 `yaml:"otp_send_per_device_per_hour"`
	LoginFailPerAccount     int64 `yaml:"login_fail_per_account"`
}

// Load 读取并解析配置文件。
//
// 文件可以用 base 指向同目录（或相对路径）的另一份配置作为底座，自身只写差异：
// 映射递归合并、标量与列表整体替换。这样环境 profile 不必复制整份配置，
// 也就不会出现「基础配置新增字段、profile 忘了同步」的静默偏差。
func Load(path string) (*Config, error) {
	merged, err := loadMap(path, 0)
	if err != nil {
		return nil, err
	}
	b, err := yaml.Marshal(merged)
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}
	c := &Config{}
	if err := yaml.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return c, nil
}

// maxBaseDepth base 链的最大层数：够表达「基础 → 环境 → 压测」的叠加，
// 也能把写成环的 base 变成一条明确的错误，而不是无限递归。
const maxBaseDepth = 4

// loadMap 把一份配置读成通用映射；声明了 base 时先加载底座，再用本文件覆盖。
func loadMap(path string, depth int) (map[string]any, error) {
	if depth > maxBaseDepth {
		return nil, fmt.Errorf("config base chain too deep at %s (max %d)", path, maxBaseDepth)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cur map[string]any
	if err := yaml.Unmarshal(b, &cur); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	base, _ := cur["base"].(string)
	delete(cur, "base") // base 是加载指令，不是配置项：留给结构体解析会多出一个未知键
	if base == "" {
		return cur, nil
	}
	merged, err := loadMap(filepath.Join(filepath.Dir(path), base), depth+1)
	if err != nil {
		return nil, fmt.Errorf("base %s: %w", base, err)
	}
	return mergeMaps(merged, cur), nil
}

// mergeMaps 把 over 合并进 base（原地修改并返回 base）。
// 只对映射做递归合并：标量与列表整体替换，否则「把白名单清空」「把限额设为 0」
// 这类覆盖无法表达——空列表和 0 在合并语义里必须是一次有效的赋值。
func mergeMaps(base, over map[string]any) map[string]any {
	for k, v := range over {
		bm, isBaseMap := base[k].(map[string]any)
		om, isOverMap := v.(map[string]any)
		if isBaseMap && isOverMap {
			base[k] = mergeMaps(bm, om)
			continue
		}
		base[k] = v
	}
	return base
}

// Env 取环境变量（*_env 引用的真实凭据从部署环境读取）。
func Env(name string) string { return os.Getenv(name) }

// RequireEnv 取环境变量，缺失即报错（启动即失败，绝不静默空密钥）。
func RequireEnv(name string) (string, error) {
	v := os.Getenv(name)
	if v == "" {
		return "", fmt.Errorf("required env %s is empty", name)
	}
	return v, nil
}
