# spreader — 本地开发入口
#
# 做什么：
#   - 把服务在这台机器上跑起来：依赖组件、环境变量、启动参数、压测 profile
#   - 记住容易记错的命令：goimports 的 -local 前缀、compose 文件路径、压测库
#   - make check 一条命令跑完 CI 那套检查（顺序与参数都与 ci.yml 相同）
#
# 不做什么：
#   - 不定义构建或校验的「权威标准」：权威定义在 .github/workflows/ci.yml，
#     这里只是它的本地镜像，CI 改了要同步改 make check。
#   - 不参与生产构建：镜像由根目录 Dockerfile 直接编 ./app/cmd/server，不经过 make。
#   - 不用 ./...：它会把 web/node_modules 里的第三方 Go 包也扫进来（该目录只有
#     npm install 之后才存在），于是同一份代码在不同机器上扫到的包集合不一样。
#
# 注意（Windows）：recipe 里的 echo 一律写 ASCII。Windows 版 make 按 ANSI 代码页
# 解析 recipe 行，中文会变成乱码；`##` 后面的中文描述不受影响（它们由 grep 直接读出）。
# 所以「说明」可以中文，「打印」只能英文。
#
# 用法：make help

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 工具版本（与 .github/workflows/ci.yml 保持一致）
GOLANGCI_LINT_VERSION := v2.14.0

# 包范围：见文件头「不用 ./...」
GO_PKGS := ./app/...

# 本地依赖组件
COMPOSE_FILE := deploy/compose/docker-compose.yml
COMPOSE_CMD  := docker compose -f $(COMPOSE_FILE)

.PHONY: help
help: ## 显示可用目标
	@echo "spreader targets:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ==================== 启动 ====================

.PHONY: run
run: ## 本地运行服务（先 make init；凭据取自 .env）
	@test -f .env && { set -a; . ./.env; set +a; } || echo "note: no .env, using built-in dev defaults"
	export SERVER_PG_DSN="$${SERVER_PG_DSN:-postgres://spreader:spreader@127.0.0.1:15432/spreader?sslmode=disable}"
	export SERVER_JWT_SECRET="$${SERVER_JWT_SECRET:-dev-only-jwt-secret-32bytes-min}"
	export SERVER_OTP_PEPPER="$${SERVER_OTP_PEPPER:-dev-only-otp-pepper}"
	export SERVER_ARGON_PEPPER="$${SERVER_ARGON_PEPPER:-dev-only-argon-pepper}"
	go run ./app/cmd/server -conf app/configs/server.yaml

.PHONY: loadtest-db
loadtest-db: ## 建压测独立库 spreader_loadtest（幂等；make loadtest 之前跑一次）
	@$(COMPOSE_CMD) exec -T postgres psql -U spreader -d spreader -tAc \
		"SELECT 1 FROM pg_database WHERE datname='spreader_loadtest'" | grep -q 1 \
		|| { echo "creating spreader_loadtest"; $(COMPOSE_CMD) exec -T postgres createdb -U spreader spreader_loadtest; }

# 固定连压测库：.env 里的 SERVER_PG_DSN 指向主库，压测「登录即注册」会把主库灌满。
# 要换目标库用 LOADTEST_PG_DSN，而不是复用 SERVER_PG_DSN。
.PHONY: loadtest
loadtest: ## 以压测 profile 启动（server.loadtest.yaml；连独立库，先在 perf/ 下跑 k6）
	@test -f .env && { set -a; . ./.env; set +a; } || echo "note: no .env, using built-in dev defaults"
	export SERVER_PG_DSN="$${LOADTEST_PG_DSN:-postgres://spreader:spreader@127.0.0.1:15432/spreader_loadtest?sslmode=disable}"
	export SERVER_JWT_SECRET="$${SERVER_JWT_SECRET:-dev-only-jwt-secret-32bytes-min}"
	export SERVER_OTP_PEPPER="$${SERVER_OTP_PEPPER:-dev-only-otp-pepper}"
	export SERVER_ARGON_PEPPER="$${SERVER_ARGON_PEPPER:-dev-only-argon-pepper}"
	go run ./app/cmd/server -conf app/configs/server.loadtest.yaml

# ==================== 校验（CI 的本地镜像） ====================

# 顺序与 .github/workflows/ci.yml 的两个 job 一致：build → vet → lint → test。
# -race 需要 CGO_ENABLED=1 和一个 C 工具链（Windows 装 mingw）；缺了会在最后一步停下，
# 这一步本地跑不了就交给 CI，别把 -race 删掉——删了就失去了「本地等于 CI」的唯一价值。
.PHONY: check
check: ## 跑与 CI 同参的整套检查（build → vet → lint → test -race）
	@which golangci-lint >/dev/null 2>&1 || { echo "golangci-lint $(GOLANGCI_LINT_VERSION) not installed"; exit 1; }
	go build $(GO_PKGS)
	go vet $(GO_PKGS)
	golangci-lint run $(GO_PKGS)
	go test -race -coverprofile=coverage.txt -covermode=atomic $(GO_PKGS)
	@echo "coverage: go tool cover -func=coverage.txt"

# ==================== 本地修复（不进 CI，只改代码不改门禁） ====================

.PHONY: fmt
fmt: ## 格式化代码（gofmt + goimports，内部 import 分组前缀固定）
	go fmt $(GO_PKGS)
	go run golang.org/x/tools/cmd/goimports@latest -local github.com/phantom5099/spreader -w app/

.PHONY: lint-fix
lint-fix: ## 跑 golangci-lint 并自动修复可修的部分
	golangci-lint run --fix $(GO_PKGS)

# ==================== 本地依赖 ====================

.PHONY: compose-up
compose-up: ## 启动本地依赖组件（PG / Redis / Prometheus / Grafana）
	$(COMPOSE_CMD) up -d
	@echo "PostgreSQL  127.0.0.1:15432"
	@echo "Redis       127.0.0.1:16379"
	@echo "Prometheus  http://127.0.0.1:19090"
	@echo "Grafana     http://127.0.0.1:13000 (admin / admin)"

.PHONY: compose-down
compose-down: ## 停止本地依赖（保留数据卷）
	$(COMPOSE_CMD) down

.PHONY: compose-clean
compose-clean: ## 停止本地依赖并清除数据卷
	$(COMPOSE_CMD) down -v
	rm -rf deploy/compose/data

.PHONY: compose-logs
compose-logs: ## 查看依赖组件日志
	$(COMPOSE_CMD) logs -f

.PHONY: compose-ps
compose-ps: ## 查看依赖组件状态
	$(COMPOSE_CMD) ps

# ==================== 环境 ====================

.PHONY: env
env: ## 由示例生成 .env（不存在时）
	@test -f .env || (cp .env.example .env && echo "created .env, adjust as needed")

.PHONY: init
init: env compose-up ## 一键初始化：.env + 依赖组件
	@echo "ready. make run to start; make check runs what CI runs."

# ==================== 清理 ====================

.PHONY: clean
clean: ## 清理构建产物与覆盖率文件
	rm -rf bin dist build/tmp coverage.txt coverage.html
