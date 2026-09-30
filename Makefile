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

# 服务列表（单模块仓库：每个服务是 app/ 下的一个目录，不是独立模块）
SERVICES := gateway identity content media feed interaction relation message realtime search notification moderation

.PHONY: help
help: ## 显示可用目标
	@echo "spreader 开发命令："
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ==================== proto ====================

.PHONY: gen
gen: ## 由 proto 生成 Go 代码（HTTP + gRPC 双栈）
	@which buf >/dev/null 2>&1 || { echo "未安装 buf，见 https://buf.build/docs/installation"; exit 1; }
	buf dep update
	buf lint
	buf generate

.PHONY: gen-lint
gen-lint: ## 仅校验 proto（lint + breaking）
	buf lint
	buf breaking --against '.git#branch=main'

.PHONY: proto-tools
proto-tools: ## 安装 proto 工具链（buf + 三个 protoc 插件，版本与 buf.gen.yaml 一致）
	go install github.com/bufbuild/buf/cmd/buf@latest
	go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
	go install github.com/go-kratos/kratos/cmd/protoc-gen-go-http/v3@v3.0.0-20260526000039-30da04b769dc

# ==================== 构建与测试 ====================

.PHONY: build
build: ## 编译全部模块
	go build ./...

.PHONY: build-% 
build-%: ## 编译指定服务，如 make build-identity
	@test -d app/$* || { echo "服务 app/$* 不存在"; exit 1; }
	go build ./app/$*/...

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
compose-up: ## 启动本地依赖组件（PG / Redis / Kafka / MinIO / ES）
	$(COMPOSE_CMD) up -d
	@echo "PostgreSQL  127.0.0.1:15432"
	@echo "Redis       127.0.0.1:16379"
	@echo "Kafka       127.0.0.1:19092"
	@echo "MinIO       http://127.0.0.1:19000 （控制台 :19001）"
	@echo "Elasticsearch http://127.0.0.1:19200"

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
init: env compose-up gen tidy ## 一键初始化：环境变量 + 依赖组件 + proto 生成 + 依赖整理
	@echo "初始化完成。执行 make build 验证编译。"

# ==================== 清理 ====================

.PHONY: clean
clean: ## 清理构建产物与覆盖率文件
	rm -rf bin dist build/tmp coverage.txt coverage.html
