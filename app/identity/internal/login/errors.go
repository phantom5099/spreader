package login

import "fmt"

// Error 领域错误：业务码（ErrorReason 常量）+ HTTP 状态 + 可重试标记。
// 仓储实现负责把驱动错误映射到这里的领域错误，上层永不分支于驱动错误。
type Error struct {
	HTTP      int
	Reason    string // ErrorReason 取值（IAM.*）
	Message   string
	Retryable bool
	// 命中 CAPTCHA_REQUIRED/CAPTCHA_FAILED 时携带领域挑战；handler 转为传输形状放入错误 metadata。
	Captcha *Challenge
}

func (e *Error) Error() string { return fmt.Sprintf("%s: %s", e.Reason, e.Message) }

// newErr 新建错误：业务码一律取自 ErrorReason 常量，禁止手写字符串。
func newErr(http int, r ErrorReason, msg string, retryable bool) *Error {
	return &Error{HTTP: http, Reason: string(r), Message: msg, Retryable: retryable}
}

func EUnsupportedLoginType(msg string) *Error {
	return newErr(400, ReasonUnsupportedLoginType, msg, false)
}

func EBadRequest(msg string) *Error {
	return newErr(400, ReasonBadRequest, msg, false)
}

func EOtpSendTooFrequent() *Error {
	return newErr(429, ReasonOtpSendTooFrequent, "60s 内重复发码", true)
}

func EOtpDailyLimitExceeded() *Error {
	return newErr(429, ReasonOtpDailyLimitExceeded, "日额度用尽", true)
}

func EOtpInvalid() *Error {
	return newErr(400, ReasonOtpInvalid, "验证码错误/过期/尝试过多", true) // 合并为一码，防枚举
}

func EInvalidCredentials() *Error {
	return newErr(401, ReasonInvalidCredentials, "账号不存在或密码错误", false) // 统一一码，防枚举
}

func EAccountLocked() *Error {
	return newErr(429, ReasonAccountLocked, "失败次数过多，请稍后再试", true)
}

func EAccountBanned() *Error {
	return newErr(403, ReasonAccountBanned, "账号已被封禁", false)
}

func EOauthStateInvalid() *Error {
	return newErr(400, ReasonOauthStateInvalid, "state 校验失败（过期/不匹配/已消费）", false)
}

func ERefreshTokenReused() *Error {
	return newErr(401, ReasonRefreshTokenReused, "刷新令牌已被撤销（检测到重放）", false)
}

func ETokenInvalid(msg string) *Error {
	return newErr(401, ReasonTokenExpired, msg, true)
}

func ECaptchaRequired(ch *Challenge) *Error {
	e := newErr(400, ReasonCaptchaRequired, "需要人机验证", true)
	e.Captcha = ch
	return e
}

func ECaptchaFailed(ch *Challenge) *Error {
	e := newErr(403, ReasonCaptchaFailed, "人机验证未通过，可重新挑战", true)
	e.Captcha = ch // 可携带新 Challenge 供重试（§4.5 流程）
	return e
}

func EChannelUnavailable() *Error {
	return newErr(503, ReasonChannelUnavailable, "验证码/人机验证/第三方通道全部不可用", true)
}

func EThirdPartyAuthFailed(msg string) *Error {
	return newErr(401, ReasonThirdPartyAuthFailed, msg, true)
}

func ECaptchaLocked() *Error {
	return newErr(403, ReasonCaptchaFailed, "人机验证已锁定，请稍后再试", false)
}

func ETooManyAttempts() *Error {
	return newErr(429, ReasonTooManyAttempts, "尝试过于频繁", true)
}
