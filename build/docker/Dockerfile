# 服务镜像多阶段构建模板（架构文档 §8.3：各进程以容器交付，镜像内不含配置与密钥）
#
# 用法（在仓库根目录构建）：
#   docker build -f build/docker/Dockerfile -t spreader/server:<版本> .
#
# 说明：
# - 构建上下文为仓库根目录（需要 go.mod/go.sum 与 app/、pkg/）。
# - 镜像内只含二进制与 CA 证书，不含配置与密钥（由环境注入，§8.5）。

# ---------- 构建阶段 ----------
FROM golang:1.26-alpine AS builder

ENV CGO_ENABLED=0 GOOS=linux

WORKDIR /src

# 先复制依赖描述文件以复用层缓存
COPY go.mod go.sum* ./
COPY app/ ./app/
COPY pkg/ ./pkg/

# 下载依赖（无 go.sum 时首次解析）
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# 编译进程入口
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /out/app ./app/cmd/server

# ---------- 运行阶段 ----------
FROM alpine:3.20

# CA 证书（调用 HTTPS 外部服务需要）与时区数据
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 appuser

COPY --from=builder /out/app /usr/local/bin/app

USER appuser

# 默认入口；实际端口由环境变量决定（见 .env.example）
ENTRYPOINT ["/usr/local/bin/app"]
