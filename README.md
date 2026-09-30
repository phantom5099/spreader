# spreader

TikTok 式纯社交平台（Web / Android / iOS 共用同一套服务端）。

> 本仓库为个人独立项目。架构定案见 `docs-hide/架构设计文档（补全版）.md`（私有文档，不入库）。

## 技术栈

| 层 | 选型 | 架构依据 |
| --- | --- | --- |
| 开发语言 | Go | §3.1.1 |
| 服务端框架 | Kratos v3（API-first，同一份 proto 生成 HTTP + gRPC 双栈） | §3.1.2 |
| 服务间通信 | gRPC + Protocol Buffers | §3.1.3 |
| 长连接与实时通信 | 自建 WebSocket | §3.1.4 |
| 关系型数据库 | PostgreSQL | §3.2.1 |
| 缓存 | Redis | §3.2.2 |
| 消息队列 | Kafka（KRaft 模式） | §3.2.3 |
| 对象存储 | S3 兼容对象存储 + 分片上传 | §3.2.4 |
| 全文检索 | Elasticsearch | §3.2.5 |
| 入口层 | 外部负载均衡 + Gateway API + 业务网关 | §3.6.1 |
| 接口契约治理 | Buf | §3.6.4 |
| 可观测性 | OpenTelemetry + Prometheus + Alertmanager | §3.6.9 |
| 编排平台 | Kubernetes（生产）/ Compose（单机开发） | §3.6.15 |

## 仓库结构

单模块（单个 `go.mod`）。各服务是 `app/` 下的一个目录，不是独立模块——这也是 Kratos 官方多服务示例
[`beer-shop`](https://github.com/go-kratos/beer-shop) 的做法。proto 生成产物与 proto 同目录（`api/`）并随源码提交。

```
.
├── go.mod                   # 唯一的模块定义（github.com/phantom5099/spreader）
├── api/                     # proto 契约（唯一对外契约来源，生成产物同目录落此）
│   └── <域>/v1/*.proto      # 按 §5.7「api/<domain>/<version>」组织
├── app/                     # 各服务（一个服务一个目录；沿用 Kratos 标准布局 cmd/ + internal/）
│   ├── gateway/             # 业务网关 / BFF（§3.6.1）
│   ├── identity/            # 身份与账号
│   ├── content/             # 内容
│   ├── media/               # 媒体
│   ├── feed/                # 信息流 / 推荐
│   ├── interaction/         # 互动
│   ├── relation/            # 关系
│   ├── message/             # 消息
│   ├── realtime/            # 实时通信（长连接网关）
│   ├── search/              # 搜索与话题
│   ├── notification/        # 通知
│   └── moderation/          # 审核与处置
├── pkg/                     # 跨服务复用的公共库（配置、日志、错误、ID 等）
├── deploy/
│   ├── compose/             # 本地依赖组件编排（开发环境）
│   └── k8s/                 # Kubernetes 部署清单（生产）
├── scripts/                 # 工具脚本
├── build/                   # 构建相关（Dockerfile 模板等）
└── .github/workflows/       # CI
```

## 快速开始

### 前置要求

- Go 1.26.1+
- Docker Desktop（本地依赖组件）
- [Buf](https://buf.build/docs/installation)（proto 生成；亦可 `go install github.com/bufbuild/buf/cmd/buf@latest`）
- GNU Make（可选，`make` 目标亦可手工执行等价命令）

> **网络**：若 `proxy.golang.org` 不可达，请设置
> `go env -w GOPROXY=https://goproxy.cn,direct`（国内镜像），否则 `go mod tidy` 与
> `buf generate`（插件经 `go run` 拉取）都会失败。`buf dep update` 从 BSR 拉取
> googleapis 依赖，走的是 buf.build，与之无关。

### 初始化

```bash
# 1. 安装 protoc 插件（版本固定，与 buf.gen.yaml 一致）
make proto-tools

# 2. 拉起本地依赖组件（PostgreSQL / Redis / Kafka / MinIO / Elasticsearch）
docker compose -f deploy/compose/docker-compose.yml up -d

# 3. 复制环境变量
cp .env.example .env

# 4. 生成 proto 代码（HTTP + gRPC 双栈，产物落在 api/ 并随源码提交）
buf dep update   # 首次：拉取 googleapis 依赖并生成 buf.lock
buf lint
buf generate

# 5. 整理依赖并编译全部服务
go mod tidy
go build ./...
```

### 验证

```bash
# 编译并启动 identity 服务（骨架自带 Ping 探针）
go build -o bin/identity ./app/identity/cmd/identity
./bin/identity -http 127.0.0.1:8000 -grpc 127.0.0.1:9000

# 另一终端：HTTP 探针
curl http://127.0.0.1:8000/v1/identity/ping
# => {"service":"identity"}
```

### 常用命令

```bash
make help          # 列出全部可用目标
make proto-tools   # 安装 buf 与 protoc 插件
make gen           # buf dep update + lint + generate（proto → api/）
make build         # 编译全部服务
make test          # 运行测试
make lint          # golangci-lint
make compose-up    # 启动本地依赖
make compose-down  # 停止本地依赖并清理卷
```

## 约定

- **契约优先**：对外接口与内部 RPC 均以 `api/` 下的 proto 为准，服务间不走 Go 包级接口（§5.5）。
- **proto 包路径**：`api/<域>/<版本>`，如 `api/content/v1`；service 命名 `<域>Service`（§5.7）。
- **一文件一 service**：HTTP 路由注解（`google.api.http`）直接写在 service 内各 RPC 上，
  不另立 `*Http` service —— 与 Kratos 官方模板 `kratos-layout` 一致。
- **错误码**：`<域>_error_reason.proto` 只放纯 `enum ErrorReason`，**不 import 任何 proto**；
  业务侧用 `kratos errors.NotFound(ErrorReason_X.String(), ...)` 构造（同为官方模板做法）。
- **生成产物提交**：`api/` 下的 `*.pb.go`（含 `_grpc` / `_http` / `_error_reason`）随源码提交，
  CI 用「`buf generate` 后 `git diff --exit-code`」防止漂移。
- **错误体**：对外统一 `application/problem+json`（RFC 9457）+ 机器可读业务码（§5.5）。
- **状态归属唯一**：每类状态只有归属服务可写，其他服务只读或提交变更请求（§5.5）。
- **配置与密钥**：镜像内不含配置与密钥，由环境注入（§8.5）。
- **私有文档**：`docs-hide/` 与 `docs-ignore/` 已在 `.gitignore` 中，不入库。

## 许可

私有项目，未授权不得使用。
