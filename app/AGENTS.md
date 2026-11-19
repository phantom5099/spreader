# AGENTS.md — app/（Go 后端）工作约定

> 本目录是后端主体，全部代码跑在**同一个进程**（`app/cmd/server`）里。
> 改动本目录下的文件时，**本文件的规则优先于根 `AGENTS.md`**。
> HTTP 面就是契约：路由注册在 `app/<module>/<module>.go`。

## 进程级结构

```
app/
├── cmd/server/main.go     # 进程入口：配置、基础设施、模块装配、生命周期（只做装配）
├── configs/               # 本进程的运行配置（不含密钥）
├── platform/              # 进程级设施，不认识任何领域类型
│   ├── config/            # 配置加载与 base 叠加
│   ├── metrics/           # 按路由的 RED 指标、/metrics 与 pprof 管理端口
│   └── httpx/             # panic 恢复过滤器、problem+json 编码器
└── <module>/              # 一个业务模块一个目录
    ├── <module>.go        # 唯一公开面：Deps / New(deps) / Register(routes)
    ├── infra.go           # 可选：模块自持的连接与生命周期
    └── internal/          # 从 cmd/ 不可达——编译器强制
        ├── <domain>/      # 一个业务资源一个包
        └── platform/      # 适配器：DB、缓存、外部调用
```

**模块内部不要再建 `cmd/` 或 `configs/`**：入口只有 `app/cmd/server` 一个，配置只有
`app/configs/` 一处。模块需要暴露给入口的东西，由 `<module>.go` 转发（`internal/` 出不来）。

## 模块

目前只有 `identity` 存在。其余是**规划中的域，不是目录**：等它第一行代码要写时再创建
`app/<module>/`，绝不留空占位。

| 目录 | 职责 |
| --- | --- |
| `app/identity` | 身份与账号：登录（登录即注册）、验证码、会话令牌、绑定/合并、注销（细节见 `app/identity/AGENTS.md`） |
| `content`（规划） | 内容：帖子创建、编辑、发布、撤下与删除，以及发布状态 |
| `media`（规划） | 媒体：上传、分片、转码调度、元数据 |
| `feed`（规划） | 信息流 / 推荐：分页、去重、刷新与续接 |
| `interaction`（规划） | 互动：点赞、评论、转发、收藏、举报 |
| `relation`（规划） | 关系：关注、粉丝、拉黑、静音、可见范围 |
| `message`（规划） | 消息：私信会话与投递 |
| `realtime`（规划） | 实时：长连接（WebSocket） |
| `search`（规划） | 搜索与话题：全文检索、话题归一化 |
| `moderation`（规划） | 审核与处置：机审/人审、处置决策与回写 |

## 领域包

一个业务资源一个包（`post/`、`comment/`、`follow/`……），该资源的四类关注点都留在包内：

| 文件 | 职责 |
| --- | --- |
| `model.go` | 领域对象与不变量；不带传输层或存储层 tag |
| `service.go` | 用例：对外暴露的业务能力 |
| `repository.go` | **只声明**存储读写接口；实现不在这里（见下） |
| `handler.go` | HTTP 适配：传输 DTO ↔ 领域对象，保持薄 |

- 包内调用方向单一：`handler → service → repository`。
- 一个文件够用就不要拆；等它长大了再按上表拆。

## 依赖倒置：抽象归调用者

核心原则：**接口属于使用它的一方，而不是实现它的一方。** 领域包需要存储，就由领域包声明
存储接口；`platform/` 只负责实现。

```
app/cmd/server/main.go                    <- 装配点：唯一同时 import 两侧的地方
   ├──────────► internal/<domain>/        声明 XxxRepository 接口（使用方）
   └──────────► internal/platform/<store>/ 实现 XxxRepository
                        │
                        └── import ──────► internal/<domain>/（为了满足接口、返回领域类型）
```

- **接口由调用者声明**：`XxxRepository` 放在领域包的 `repository.go` 里。**禁止**在
  `platform/` 里定义接口让上层去适配，也**禁止**在实现侧「为了方便 mock」定义接口——
  测试替身应该去 fake 调用者声明的那个接口。
- **领域包永不 import `platform/`**：它只认识自己的接口，因此对具体存储一无所知。方向是倒置的。
- **`platform/` import 领域包**（为了满足接口、返回领域类型）——这是整个设计里**唯一允许的反向
  import**，它是依赖倒置的接缝。任何其它反向 import 都是分层错误：改设计，不要加 import。
- **装配只发生在 `cmd/`**：`main.go` 构造具体实现并注入领域包（手工构造器注入）。换存储只动
  `platform/` 与 `cmd/`，业务代码不受影响。
- **构造函数返回具体类型**，不返回接口；需要接口的位置由赋值满足。
- **不要提前抽接口**：先写具体实现；真的出现第二个实现、或确实需要测试替身时，才在调用者处
  抽接口。只有一个实现时，直接用具体类型。
- 仓储实现不得把驱动错误透传出去：在实现内部映射成领域错误，让上层永远不用对驱动分支。

## 跨包共享：没有共享层

**单一归属**：每份数据或概念有且只有一个归属包，其它包不得重新定义。需要别的包里的东西时，
只有三种拿法，**且都不会新增包**：

| 你需要什么 | 怎么拿 |
| --- | --- |
| 一个标识 / 值 / 枚举 | 直接用归属包的类型（如 `post.ID`） |
| 它的一部分数据，但形状不同 | **消费方定义自己的投影类型与自己的转换**，放在消费方包里（防腐层） |
| 它的行为 | **消费方声明一个窄接口**，由 `cmd/` 注入实现 |

- **Go 包不得命名为 `shared` / `common` / `util`**（既有的前端 `web/src/utils/` 不受此限）：
  它们没有归属，会变成人人依赖的「依赖垃圾桶」，随项目增长成为 import cycle 的源头。
- **出现双向依赖时只有两个选项**：（1）**重划包边界**（合并，或把归属明确划给一侧）；
  （2）**用接口注入做成单向**。**没有「抽一个共享包」这第三个选项。**
- 少量刻意的重复是可以接受的：同一份数据可以在多处定义投影。上游字段变化时，各处
  **编译失败**，不会有静默漂移。如果重复多到难以维护，信号是**包边界划错了**（合并或重新划
  归属），而不是需要一个共享包。
- **跨模块也是同样三种拿法**，只是没有共享包这条退路：只能 import 对方的**公开包**，
  绝不碰它的 `internal/`。`pkg/` 是可复用的**基础设施库**（配置 / 日志 / 错误 / ID），
  不是领域共享层。

## 模块隔离

- `internal/` 的父目录就是模块，所以 **`app/<module>/internal/...` 只能被该模块自己的子树 import**；
  跨模块引用不会编译。这就是模块边界——由编译器强制，不靠 code review。
- 要调用别的模块：**消费方声明一个窄接口**（如 `feed` 声明 `PostReader`），由 `cmd/` 注入对方
  的实现。将来把某个模块拆成独立进程时，只有装配处要改——一个基于 RPC 实现同一接口的适配器
  替换掉本地调用即可。业务代码不受影响。

## 后端改动的落点

| 你想做什么 | 去哪里 |
| --- | --- |
| 某业务能力的模型 / 用例 / **仓储接口** | `app/<module>/internal/<domain>/` |
| 对外端点实现（DTO ↔ 领域对象） | `app/<module>/internal/<domain>/handler.go` |
| 存储 / 缓存 / 外部调用的**具体实现**与设施装配 | `app/<module>/internal/platform/<子包>/` |
| 把实现注入领域包（依赖装配） | `app/cmd/server/main.go` |
| 配置字段或配置文件 | `app/platform/config/`、`app/configs/` |
| 进程启动逻辑 | `app/cmd/server/main.go` |
| 增改对外端点 | `app/<module>/<module>.go` 的路由 + `handler.go` 的方法 |

## Go 代码约定

- 用 `make fmt` 格式化（`gofmt` + `goimports`）；内部 import 分组前缀是 `github.com/phantom5099/spreader`。
- 必须通过 `golangci-lint`（配置在根 `.golangci.yml`，含 `errcheck` / `errorlint` /
  `govet(enable-all)` / `revive` / `staticcheck` / `gocritic` 等）。
- 错误处理：`errcheck` 开了类型断言与空白赋值检查；用 `%w` 包装，用 `errors.Is/As` 判定。
- 错误名以 `Err` 前缀开头（`errname`）。
- 循环变量、`context` 传递、资源关闭（`bodyclose`）按 lint 要求来。
- 包注释与导出标识符注释按 `revive` 要求写，每条最多 3 行（根文件 §4.1）。

## 命令

```bash
# 仓库级（根 Makefile）
make check         # build -> vet -> lint -> test -race，与 CI 同一串命令
make fmt           # gofmt + goimports
make lint-fix      # golangci-lint --fix

# 单个包（常见情况；范围是 ./app/...，绝不用 ./...）
go test ./app/identity/internal/login/...

# 构建并启动进程
go build -o bin/server ./app/cmd/server
./bin/server -conf app/configs/server.yaml
curl http://127.0.0.1:8000/healthz   # => {"status":"ok"}
```

## 边界

- 模块之间通过消费方声明的 Go 接口通信，绝不互相 import 对方的 `internal/`。
- **同一份状态只有一个写入者**：某类状态只有归属模块能写，其它模块只能读或提交变更请求。
- 本地依赖（PostgreSQL / Redis / Prometheus / Grafana）在仓库根用 `make compose-up` 启动。
