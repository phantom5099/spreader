# spreader — 开发任务入口
# 用法：make help

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 项目根目录（Makefile 所在目录）
ROOT_DIR := $(shell cd "$(dir $(lastword $(MAKEFILE_LIST)))" && pwd)

# 工具版本（与 .github/workflows 保持一致）
GOLANGCI_LINT_VERSION := v2.14.0

# 本地依赖组件
COMPOSE_FILE := deploy/compose/docker-compose.yml
COMPOSE_CMD  := docker compose -f $(COMPOSE_FILE)

.PHONY: help
help: ## 显示可用目标
	@echo "spreader 开发命令："
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ==================== 构建与测试 ====================

.PHONY: build
build: ## 编译全部模块
	go build ./...

.PHONY: build-server
build-server: ## 编译进程入口
	go build ./app/cmd/server

.PHONY: run
run: ## 本地运行服务（先 make compose-up + make env；凭据取自 .env）
	@test -f .env && { set -a; . ./.env; set +a; } || echo "提示：无 .env，使用内置开发默认值"
	export SERVER_PG_DSN="$${SERVER_PG_DSN:-postgres://spreader:spreader@127.0.0.1:15432/spreader?sslmode=disable}"
	export SERVER_JWT_SECRET="$${SERVER_JWT_SECRET:-dev-only-jwt-secret-32bytes-min}"
	export SERVER_OTP_PEPPER="$${SERVER_OTP_PEPPER:-dev-only-otp-pepper}"
	export SERVER_ARGON_PEPPER="$${SERVER_ARGON_PEPPER:-dev-only-argon-pepper}"
	go run ./app/cmd/server -conf app/configs/server.yaml

.PHONY: loadtest-db
loadtest-db: ## 建压测独立库 spreader_loadtest（幂等；make loadtest 之前跑一次）
	@$(COMPOSE_CMD) exec -T postgres psql -U spreader -d spreader -tAc \
		"SELECT 1 FROM pg_database WHERE datname='spreader_loadtest'" | grep -q 1 \
		|| { echo "创建 spreader_loadtest"; $(COMPOSE_CMD) exec -T postgres createdb -U spreader spreader_loadtest; }

.PHONY: loadtest
loadtest: ## 以压测 profile 启动（server.loadtest.yaml；连独立库，先在 perf/ 下跑 k6）
	@test -f .env && { set -a; . ./.env; set +a; } || echo "提示：无 .env，使用内置开发默认值"
	# 固定连压测库：.env 里的 SERVER_PG_DSN 指向主库，压测「登录即注册」会把主库灌满。
	# 要换目标库用 LOADTEST_PG_DSN，而不是复用 SERVER_PG_DSN。
	export SERVER_PG_DSN="$${LOADTEST_PG_DSN:-postgres://spreader:spreader@127.0.0.1:15432/spreader_loadtest?sslmode=disable}"
	export SERVER_JWT_SECRET="$${SERVER_JWT_SECRET:-dev-only-jwt-secret-32bytes-min}"
	export SERVER_OTP_PEPPER="$${SERVER_OTP_PEPPER:-dev-only-otp-pepper}"
	export SERVER_ARGON_PEPPER="$${SERVER_ARGON_PEPPER:-dev-only-argon-pepper}"
	go run ./app/cmd/server -conf app/configs/server.loadtest.yaml

.PHONY: test
test: ## 运行全部测试
	go test ./...

.PHONY: test-race
test-race: ## 运行测试并开启竞态检测
	go test -race ./...

.PHONY: cover
cover: ## 生成覆盖率报告
	go test -coverprofile=coverage.txt -covermode=atomic ./...
	go tool cover -html=coverage.txt -o coverage.html
	@echo "覆盖率报告：coverage.html"

.PHONY: tidy
tidy: ## 整理依赖
	go mod tidy

.PHONY: fmt
fmt: ## 格式化代码
	go fmt ./...
	go run golang.org/x/tools/cmd/goimports@latest -local github.com/phantom5099/spreader -w .

.PHONY: vet
vet: ## 运行 go vet
	go vet ./...

# ==================== lint ====================

.PHONY: lint
lint: ## 运行 golangci-lint
	@which golangci-lint >/dev/null 2>&1 || { echo "未安装 golangci-lint $(GOLANGCI_LINT_VERSION)"; exit 1; }
	golangci-lint run ./...

.PHONY: lint-fix
lint-fix: ## 运行 golangci-lint 并自动修复
	golangci-lint run --fix ./...

# ==================== 本地依赖 ====================

.PHONY: compose-up
compose-up: ## 启动本地依赖组件（PG / Redis / Prometheus / Grafana）
	$(COMPOSE_CMD) up -d
	@echo "PostgreSQL  127.0.0.1:15432"
	@echo "Redis       127.0.0.1:16379"
	@echo "Prometheus  http://127.0.0.1:19090"
	@echo "Grafana     http://127.0.0.1:13000 （admin / admin）"

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
	@test -f .env || (cp .env.example .env && echo "已生成 .env，请按需修改")

.PHONY: init
init: env compose-up tidy ## 一键初始化：环境变量 + 依赖组件 + 依赖整理
	@echo "初始化完成。执行 make build 验证编译。"

# ==================== 清理 ====================

.PHONY: clean
clean: ## 清理构建产物与覆盖率文件
	rm -rf bin dist build/tmp coverage.txt coverage.html
