# 服务镜像多阶段构建模板（架构文档 §8.3：各进程以容器交付，镜像内不含配置与密钥）
#
# 用法（在仓库根目录构建）：
#   docker build -f build/docker/Dockerfile -t spreader/<服务名>:<版本> \
#     --build-arg SERVICE=identity .
#
# 说明：
# - 构建上下文为仓库根目录（需要 go.mod/go.sum 与 app/、pkg/、api/）。
# - 生成代码（api/ 下的 *.pb.go）随源码提交，故构建阶段不需要 buf。
# - 镜像内只含二进制与 CA 证书，不含配置与密钥（由环境注入，§8.5）。

# ---------- 构建阶段 ----------
FROM golang:1.26-alpine AS builder

ARG SERVICE
ENV CGO_ENABLED=0 GOOS=linux

WORKDIR /src

# 先复制依赖描述文件以复用层缓存
COPY go.mod go.sum* ./
COPY app/ ./app/
COPY api/ ./api/
COPY pkg/ ./pkg/

# 下载依赖（无 go.sum 时首次解析）
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# 编译目标服务
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    test -d app/${SERVICE} || (echo "服务 app/${SERVICE} 不存在" && exit 1) && \
    go build -trimpath -ldflags="-s -w" -o /out/app ./app/${SERVICE}/cmd/...

# ---------- 运行阶段 ----------
FROM alpine:3.20

# CA 证书（调用 HTTPS 外部服务需要）与时区数据
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 appuser

COPY --from=builder /out/app /usr/local/bin/app

USER appuser

# 默认入口；实际端口由环境变量决定（见 .env.example）
ENTRYPOINT ["/usr/local/bin/app"]
