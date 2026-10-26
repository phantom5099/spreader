// Package sms CodeSender 的云短信实现：cloud_sms（腾讯云 v3 API，TC3-HMAC-SHA256 手工签名，免重 SDK）。
package sms

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/phantom5099/spreader/app/identity/internal/otp"
)

// httpClient 短信调用超时上限。必须显著小于 SendOtp 的路由预算（login.budgetExternal 8s）：
// 主备通道各占一次，超时值定得比路由预算还宽就永远不会触发，降级也就无从谈起。
var httpClient = &http.Client{Timeout: 3 * time.Second}

// CloudSMS 腾讯云短信。凭据全部走 env（仓库零秘密）。
type CloudSMS struct {
	secretID   string
	secretKey  string
	sdkAppID   string
	signName   string
	templateID string
	host       string
}

// NewCloudSMS 构建；provider 仅支持 tencent（aliyun 需另实现适配）。
func NewCloudSMS(provider, secretID, secretKey, sdkAppID, signName, templateID string) (*CloudSMS, error) {
	if provider != "tencent" {
		return nil, fmt.Errorf("unsupported sms provider: %s", provider)
	}
	if secretID == "" || secretKey == "" || sdkAppID == "" || templateID == "" {
		return nil, fmt.Errorf("cloud_sms credentials incomplete (check *_env)")
	}
	return &CloudSMS{
		secretID: secretID, secretKey: secretKey, sdkAppID: sdkAppID,
		signName: signName, templateID: templateID, host: "sms.tencentcloudapi.com",
	}, nil
}

// Send 实现 otp.Sender。to 为 E.164 手机号（+86...）。
func (s *CloudSMS) Send(ctx context.Context, to, code string) error {
	body, _ := json.Marshal(map[string]any{
		"PhoneNumberSet":   []string{to},
		"SmsSdkAppId":      s.sdkAppID,
		"SignName":         s.signName,
		"TemplateId":       s.templateID,
		"TemplateParamSet": []string{code},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://"+s.host+"/", bytes.NewReader(body))
	if err != nil {
		return err
	}
	authorization, err := s.sign("POST", "/", "", body, time.Now())
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", authorization)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", s.host)
	req.Header.Set("X-TC-Action", "SendSms")
	req.Header.Set("X-TC-Version", "2021-01-11")
	req.Header.Set("X-TC-Timestamp", fmt.Sprintf("%d", time.Now().Unix()))

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	var out struct {
		Response struct {
			SendStatusSet []struct {
				Code    string `json:"Code"`
				Message string `json:"Message"`
			} `json:"SendStatusSet"`
			Error *struct {
				Code    string `json:"Code"`
				Message string `json:"Message"`
			} `json:"Error"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("sms response: %w (%s)", err, truncate(string(raw), 200))
	}
	if out.Response.Error != nil {
		return fmt.Errorf("sms api error %s: %s", out.Response.Error.Code, out.Response.Error.Message)
	}
	if len(out.Response.SendStatusSet) == 0 || out.Response.SendStatusSet[0].Code != "Ok" {
		msg := ""
		if len(out.Response.SendStatusSet) > 0 {
			msg = out.Response.SendStatusSet[0].Message
		}
		return fmt.Errorf("sms send failed: %s", msg)
	}
	return nil
}

// sign TC3-HMAC-SHA256 请求签名（腾讯云 v3 公共签名流程）。
func (s *CloudSMS) sign(method, uri, query string, body []byte, now time.Time) (string, error) {
	ts := fmt.Sprintf("%d", now.Unix())
	date := now.UTC().Format("2006-01-02")
	hashedBody := sha256Hex(body)
	canonicalRequest := strings.Join([]string{method, uri, query,
		"content-type:application/json; charset=utf-8\nhost:" + s.host + "\n",
		"content-type;host", hashedBody}, "\n")
	hashedCanonical := sha256Hex([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{"TC3-HMAC-SHA256", ts,
		date + "/sms/tc3_request", hashedCanonical}, "\n")

	kDate := hmacSHA256([]byte("TC3"+s.secretKey), []byte(date))
	kService := hmacSHA256(kDate, []byte("sms"))
	kSigning := hmacSHA256(kService, []byte("tc3_request"))
	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))
	return fmt.Sprintf(
		"TC3-HMAC-SHA256 Credential=%s/%s/sms/tc3_request, SignedHeaders=content-type;host, Signature=%s",
		s.secretID, date, signature), nil
}

func sha256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(data)
	return m.Sum(nil)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

var _ otp.Sender = (*CloudSMS)(nil)
