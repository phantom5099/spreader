// Package login 登录域：登录方式策略、用例编排、人机验证与第三方登录的契约，
// 以及错误码与领域模型。接口由本域声明，实现在 platform（依赖倒置）。
package login

import "context"

// ── 人机验证契约─────────────────────────────────────
// 「何时验」= ChallengePolicy（场景阈值 + 风险信号）；「怎么验」= HumanVerifier（按 Kind 实现）。
// 外部只有两个动作：下发挑战（Issue）/ 判定结果（Verify），是否验与怎么验均为内部细节。

// CaptchaKind 验证实现类别：客户端据 Kind 选择渲染组件。
type CaptchaKind string

const (
	CaptchaKindNone       CaptchaKind = "none"
	CaptchaKindSelfhosted CaptchaKind = "selfhosted"
	CaptchaKindTurnstile  CaptchaKind = "turnstile"
	CaptchaKindTencent    CaptchaKind = "tencent"
	CaptchaKindAji        CaptchaKind = "aji"
)

// ChallengeScene 挑战所属业务场景（策略阈值按场景分列）。
type ChallengeScene string

const (
	SceneLogin   ChallengeScene = "login"
	SceneOTPSend ChallengeScene = "otp_send"
)

// ChallengeRequest 下发挑战的输入：策略与限流的风控信号在 issue 阶段即可获得。
type ChallengeRequest struct {
	Scene    ChallengeScene
	ClientIP string
	DeviceID string
}

// Challenge 下发的挑战材料。Payload 是题目（底图/坐标/算式/sitekey），答案与密钥绝不在内。
type Challenge struct {
	ChallengeID string
	Kind        CaptchaKind
	Payload     []byte
	ExpiresAt   int64 // unix 秒
}

// ChallengeResponse 结果请求的判定输入。
type ChallengeResponse struct {
	ChallengeID string
	Answer      []byte // 滑块轨迹+落点 / 点选坐标序列 / 输入文本 / 第三方票据
	ElapsedMs   int64  // 耗时，与指纹一并作为判定输入
	Fingerprint string
}

// CaptchaFailReason 失败分类：客户端据此决定重试（重答）或重取（过期）。
type CaptchaFailReason string

const (
	FailWrongAnswer      CaptchaFailReason = "wrong_answer"
	FailExpired          CaptchaFailReason = "expired"
	FailAttemptsExceeded CaptchaFailReason = "attempts_exceeded"
	FailProviderRejected CaptchaFailReason = "provider_rejected"
)

// SceneContext 触发式人机校验的策略输入：与 verifier 解耦，按场景定档而不做失败升级难度。
type SceneContext struct {
	Scene      ChallengeScene // login | otp_send
	IP         string
	DeviceID   string
	Identifier string // 手机号/邮箱（归一后），失败计数绑账号
}

// ChallengeResult 判定结果。
type ChallengeResult struct {
	Passed     bool
	FailReason CaptchaFailReason // 仅 Passed=false 时有意义
	Retryable  bool              // 不通过是否可重新挑战（重复失败的退避/冷却由风控计数处理）
}

// HumanVerifier 人机验证抽象：可插拔（none/selfhosted/turnstile/云验证码），按 Kind 实现。
type HumanVerifier interface {
	Kind() CaptchaKind
	// Issue 下发挑战；none 类实现返回 ErrCaptchaNotSupported。
	Issue(ctx context.Context, req *ChallengeRequest) (*Challenge, error)
	// Verify 判定结果请求：通过返回 Passed=true；业务失败（答错/过期）属正常返回而非 error，
	// error 仅保留给基础设施故障。
	Verify(ctx context.Context, resp *ChallengeResponse) (*ChallengeResult, error)
}

// ErrCaptchaNotSupported 哨兵：当前 verifier 无可签发挑战（如 none）。
var ErrCaptchaNotSupported = captchaNotSupportedError{}

type captchaNotSupportedError struct{}

func (captchaNotSupportedError) Error() string { return "captcha challenge not supported" }

type ChallengePolicy interface {
	Evaluate(ctx context.Context, sc SceneContext) (bool, error)
}
