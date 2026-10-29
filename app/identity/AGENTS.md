# AGENTS.md — app/identity（身份模块）

> 单进程 `app/cmd/server` 里的身份与账号模块。改本目录的文件时，**本文件优先于
> `app/AGENTS.md` 与根 `AGENTS.md`**。
>
> 本文件只写**定位、边界、不变量**。字段含义、函数实现步骤、单条 SQL 为什么这么写，
> 一律写在该处的源码注释里——判断标准：只对某个函数成立的话属于注释，对多个文件成立才属于本文件。

## 范围

覆盖一个账号从出现到消失：登录（登录即注册）、验证码、会话令牌、第三方登录、
人机验证、审计留痕、过期数据清理。

不覆盖：资料展示（内容域）、权限与角色、网关级限流（限流在通道实现内部）。

## 目录

```
app/identity/
├── identity.go          # 唯一公开面：Deps / New / App.Register / MaxRequestBudget
├── infra.go             # 模块自持连接：OpenInfra / Close / CleanupExpired
└── internal/            # 进程入口不可达（编译器强制）
    ├── login/           # 登录域：策略、编排、人机验证、第三方、错误码与 DTO
    ├── otp/             # 验证码域：生成、存哈希、校验、频控、通道降级
    ├── session/         # 会话域：AT 签发、RT 轮换链与重放检测、撤销
    ├── dev/thirdparty_mock/  # 开发期假平台，只在 dev 注册端点
    └── platform/        # 适配器：postgres / redis / eventlog / captcha / sms / mail
```

## 改动定位

| 要改的东西 | 去这里 |
| --- | --- |
| 路由表 | `identity.go` 的 `Register` |
| 请求/响应体形状 | `login/dto.go` |
| 业务错误码取值与构造函数 | `login/dto.go` 的 `ErrorReason` 常量 + `login/errors.go` |
| 某种登录方式的凭据校验 | `login/strategy.go`（一个方式一个 `LoginStrategy`） |
| 登录编排：风控闸门、发码、审计 | `login/service.go` |
| 人机验证契约与领域类型 | `login/captcha.go` |
| 失败计数与锁定 | `login/guards.go`（接口）+ `platform/redis`（实现） |
| AT 签发、RT 轮换与重放 | `session/session.go` |
| 存储/缓存/通道实现 | `internal/platform/<子包>/` |
| 依赖装配 | `identity.go` 的 `New` |
| 库表结构 | `internal/platform/postgres/migrations/` |

## 硬边界

1. **`internal/` 只能被本模块子树引用**，跨模块 import 不编译。对外唯一入口是
   `identity.New(Deps)` 与 `App.Register(hs)`。
2. **接口由调用者声明**：`login/repository.go` 声明 `XxxRepository`，`platform/` 只实现。
   禁止在 `platform/` 里定义「给上层用」的接口。
3. **`platform/` import 领域包是唯一允许的反向依赖**（为了返回领域类型、满足接口）。
   其它反向依赖都是分层错误，应该改设计而不是加 import。
4. **进程入口不碰 `internal/`**：`cmd/server` 只用 `Deps` / `Infra` / `New` / `Register` /
   `CleanupExpired`。`internal/` 里确实需要暴露给入口的东西，由 `identity.go` 转发。

## 对外契约

| 方法 | 路径 |
| --- | --- |
| POST | `/v1/auth/otp:send` |
| POST | `/v1/auth/login` |
| POST | `/v1/auth/captcha:issue` |
| POST | `/v1/auth/token:refresh` |
| DELETE | `/v1/auth/session` |
| GET | `/v1/me` |
| GET | `/v1/auth/thirdparty/authorize` |
| GET | `/v1/auth/thirdparty/callback` |

- 登录的四种方式**共用 `/v1/auth/login`**，`type` 只区分凭据形式，不区分用途。
- 认证走 `Authorization: Bearer <AT>`。
- 错误体一律 `application/problem+json`，`code` 取 `IAM_*` 常量。**错误码是公开契约，改名等于破坏兼容。**
- 新增端点：路由加在 `identity.go`，方法加在 `login/handler.go`，DTO 加在 `login/dto.go`。

## 不变量（改这一块之前必须知道）

- **登录即注册**：`phone_otp` / `email_otp` / `thirdparty` 首次登录即建号；`password` 不建号。
- **防枚举**：口令登录在账号不存在时也跑等价的 dummy 校验，抹平时序；OTP 的
  「错误 / 过期 / 尝试过多」对外合并为一个错误码。
- **验证码用途是服务端闭集常量**（`login.OTPScene`），由调用处给定，不接受客户端声明。
- **RT 一个会话一行**（family）：轮换即旧值失效，命中已撤销的 RT 视为重放并撤销整链。
- **失败计数绑 identifier 不绑 IP**：锁攻击者，不误伤同一出口 IP 下的正常用户。
- **风控计数读失败按动作成本分流**：`otp_send` fail-closed（短信是真实成本），
  `login` fail-open（有密码/RT 校验兜底，不该因计数不可用拒绝登录）。
- **审计脱敏在编排层**（`MaskIdentifier`）：完整手机号/邮箱不进事件、不进日志、不落库。
- **事实源与热状态分离**：会话行、审计行在 PG；验证码、challenge、AT 撤销标记只在 Redis，靠 TTL 自过期。

## 配置与密钥

- 配置结构与默认值：`app/platform/config/config.go`；本模块的段在 `app/configs/server.yaml`。
- 凭据只从环境变量读（yaml 里存变量名，不存值）。
- 超时逐层收窄：进程预算不低于 `MaxRequestBudget`，路由内再收窄，外部通道和 Redis 各自有上界。
  改任何一层的超时，都要重新核对这条链，否则收窄会失效。

## 验证

```bash
go test ./app/identity/...      # 本模块全量
go test -race ./app/identity/internal/login/...
make check                      # 与 CI 同参（含 lint 与 -race）
```

有测试的包：`login` / `otp` / `session` / `postgres`。其中 `postgres` 用最小接口打桩，
**不连真库**——迁移脚本和清理 SQL 的语义它验不了，没跑过就如实说没跑过。

## 不要做

- 不要给 `/auth/otp:send` 加 `scene` / `purpose` 字段：用途是代码路径，不是客户端能声明的数据。
  新增用途 = 新增一对签发与消费端点。
- 不要在 `platform/` 里定义接口给上层适配，也不要「为了好 mock」在生产包上开接口。
- 不要把登录失败的具体原因原样返回给客户端（账号不存在 / 密码错误 / 已锁定要合并或分级披露）。
- 不要在 `internal/` 之间新增横向依赖来「复用」：要么把归属划清，要么由调用方声明窄接口。
