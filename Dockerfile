# server 进程镜像（多阶段构建；构建机需支持 BuildKit）。
# 构建：docker build -t spreader/server:dev .
# 运行配置经 ConfigMap 挂载到 /etc/spreader/server.yaml（见 deploy/k8s/）。

# ── 构建阶段 ──────────────────────────────────────────────
FROM golang:1.26.1-alpine AS builder
WORKDIR /src
# 先拷依赖清单再拷源码：依赖不变时命中层缓存
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# 静态链接（distroless/alpine 免 glibc），去掉调试信息减小体积
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/server ./app/cmd/server

# ── 运行阶段 ──────────────────────────────────────────────
FROM alpine:3.20
# 非 root 运行：容器逃逸面最小化
RUN adduser -D -u 10001 spreader
COPY --from=builder /out/server /usr/local/bin/server
USER spreader
EXPOSE 8000 9100
ENTRYPOINT ["server"]
# 配置文件由 k8s ConfigMap（或 docker -v）挂载注入
CMD ["-conf", "/etc/spreader/server.yaml"]
