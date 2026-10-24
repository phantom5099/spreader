# server 本地 k8s 部署（Docker Desktop 自带 Kubernetes）

单节点 k8s（Docker Desktop 内置，跑在 WSL2）+ compose 里的有状态依赖（PG/Redis/Kafka）。
测的是**部署与编排的真实性**：镜像、探针、ConfigMap/Secret、HPA 扩缩；性能数字仍是同机保守值。

## 0. 前置（一次性）

1. Docker Desktop → Settings → Kubernetes → **Enable Kubernetes** → Apply（等几分钟，托盘图标变绿）
2. metrics-server（HPA 需要，Docker Desktop 默认没装）：

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# Docker Desktop 的 kubelet 用自签证书，需放开非安全 TLS：
kubectl patch deployment metrics-server -n kube-system --type=json `
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

3. Kafka 宣告地址已改为 `host.docker.internal:19092`（k8s pod 内可达；当前服务不消费它，仅项目级中间件保留），
   **改过 compose 后需重启 kafka**：`docker compose -f deploy/compose/docker-compose.yml up -d kafka --force-recreate`

## 1. 构建镜像

```powershell
docker build -t spreader/server:dev .
```

## 2. 部署

```powershell
kubectl apply -k deploy/k8s
kubectl -n spreader get pods -w        # 等 Running 且 READY 1/1
```

> ⚠️ 资源已由 `identity` 统一改名为 `server`（Deployment / Service / HPA / Secret / ConfigMap）。
> 改名是**破坏性变更**：`apply` 只会创建新资源，旧资源仍占着 8000/9100 与 NodePort。
> 已部署过的集群先 `kubectl delete -k deploy/k8s` 再 apply。

## 3. 验证

```powershell
# kind 后端不映射 NodePort，宿主机访问走 port-forward（保持窗口开着）：
kubectl -n spreader port-forward svc/server 18000:8000
curl http://127.0.0.1:18000/healthz
kubectl -n spreader logs deploy/server --tail=20    # 启动日志（迁移/监听）
```

k6 照常跑，目标换成 port-forward 口（server.config.yaml 的 mock 回跳地址已配套）：

```powershell
k6 run -e BASE_URL=http://127.0.0.1:18000 -e VUS=20 -e DURATION=30s perf/me.js
```

## 4. 看 HPA 扩容

```powershell
# 终端 1
k6 run -e BASE_URL=http://127.0.0.1:18000 -e VUS=100 -e DURATION=3m perf/me.js
# 终端 2（CPU 超 60% 后 1~2 分钟内扩副本）
kubectl -n spreader get hpa server -w
kubectl -n spreader get pods -w
```

## 5. Prometheus/Grafana 切换说明

prometheus.yml 目前抓 `host.docker.internal:9100`（宿主机裸跑的 server）。
要抓 k8s 里的实例：`kubectl -n spreader port-forward svc/server 19100:9100`，
再把 `deploy/compose/prometheus.yml` 目标端口改为 **19100**，`docker compose restart prometheus`。
两套同时跑会混流量——压 k8s 时停掉宿主机裸跑的 server。

## 6. 改配置后的生效链路

`server.config.yaml` 内容一变，configMapGenerator 生成新哈希名的 ConfigMap，
kustomize 自动改写 Deployment 引用并触发**滚动更新**——不需要手动重启：

```powershell
kubectl apply -k deploy/k8s
kubectl -n spreader rollout status deploy/server
```

## 7. 清理

```powershell
kubectl delete -k deploy/k8s     # 只删 k8s 侧；compose 依赖不受影响
```

## 安全红线（沿用 §5 设计）

- 20-secret.yaml 里只有**本地开发占位值**；真实凭据走 `kubectl create secret` 或外部 KMS，严禁提交
- metrics(9100) 含 pprof，公网暴露 = 任意人抓内存快照；当前仅 NodePort 本机可达
