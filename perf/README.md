# 性能测试（k6）

k6 脚本目录。环境要求：`make compose-up` 拉起 PG / Redis / Prometheus / Grafana，
服务以压测 profile（`app/configs/server.loadtest.yaml`）启动——OTP 走 console、频控放行、
连独立库。发压时打开 Grafana（localhost:13000）同屏看服务端曲线。

## 运行

```bash
# ① 依赖组件 + 独立库（建库幂等，只需跑一次）
make compose-up
make loadtest-db

# ② 起服务（压测 profile：连 spreader_loadtest，不碰主库）
#    要换目标库用 LOADTEST_PG_DSN，别复用 SERVER_PG_DSN——那是主库
make loadtest

# ③ 冒烟/负载（并发量 = VUS，时长 = DURATION，都是你自己的旋钮）
K6_WEB_DASHBOARD=true k6 run -e VUS=10 -e DURATION=30s perf/me.js
K6_WEB_DASHBOARD=true k6 run -e VUS=20 -e DURATION=1m perf/login_mock.js
K6_WEB_DASHBOARD=true k6 run -e VUS=20 -e DURATION=30s perf/otp_send.js

# ④ 找崩溃拐点（阶梯加压；本机跑结论偏保守，标注环境）
K6_WEB_DASHBOARD=true k6 run perf/stress.js
```

压测 profile 只写与 `server.yaml` 的差异（`base:` 引用基础配置，映射合并、标量覆盖），
新增配置项只需改 `server.yaml` 一处，profile 自动继承。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| BASE_URL | http://127.0.0.1:8000 | identity 地址 |
| VUS | 10 | 虚拟用户数（= 并发量旋钮） |
| DURATION | 30s | 持续时长 |

## 场景

| 脚本 | 压什么 | SLO（本机基线） |
| --- | --- | --- |
| me.js | 鉴权中间件 + PG 读（setup 一次登录取 AT） | p95 < 50ms |
| login_mock.js | mock 第三方全流程：authorize → confirm → login | p95 < 300ms |
| otp_send.js | Redis 频控写 + 通道抽象（console，不发真短信） | p95 < 100ms |
| refresh.js | 每迭代 登录 → RT 轮换（CAS 热点） | p95(refresh) < 100ms |
| stress.js | 阶梯 20→320 VU，找 P95 陡增拐点 | 无阈值（观察用） |

压测期间 Grafana（localhost:13000 → identity 总览）同屏看服务端侧：QPS/P95/错误率/goroutine/PG 连接池。
