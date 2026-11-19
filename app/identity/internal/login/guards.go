package login

import "context"

// PasswordFailGuard 口令登录的失败计数与锁定（Redis 实现）。
// 失败计数绑 identifier 不绑 IP——锁攻击者不误伤出口 IP；锁定只拦密码入口，不影响验证码/第三方入口。
type PasswordFailGuard interface {
	// Fail 记一次失败，返回当前窗口内失败次数；计数达 maxFails 时由实现置锁定标记。
	Fail(ctx context.Context, identifier string, maxFails int64) (int64, error)
	// Locked 锁定窗口内返回 true。
	Locked(ctx context.Context, identifier string) (bool, error)
}

// PasswordGuardConfig 失败锁定阈值（来自配置）。
type PasswordGuardConfig struct {
	MaxFails      int64 // 连续失败上限，超过即锁定
	FailWindowSec int64 // 失败计数窗口（15min）
	LockSec       int64 // 锁定时长（300s）
}

// CaptchaFailGuard 人机验证失败计数与锁定（redis 实现），与密码失败计数共用阈值语义：
// 按 ip/device/identifier 维度计数，超限 → 冷却/锁定（只拦人机验证路径）。
// session 维度留给未来已登录态挑战（登录场景无会话）。
type CaptchaFailGuard interface {
	// Fail 记一次失败（各维度计数），任一维度达 maxFails 即置锁定标记，返回最大维度计数。
	Fail(ctx context.Context, sc SceneContext, maxFails int64) (int64, error)
	// Locked 任一维度处于锁定窗口内返回 true。
	Locked(ctx context.Context, sc SceneContext) (bool, error)
}
