# 性能测试（k6）

k6 脚本目录。环境要求：identity 以 loadtest 配置运行（OTP 走 console、mock 第三方放行）、
compose 的 PG/Redis/Kafka 已起。发压时打开 Grafana（localhost:13000）同屏看服务端曲线。

## 运行

```bash
# ① 起 identity（压测 profile，独立库）
CREATE DATABASE spreader_loadtest;   -- psql 执行一次
export SERVER_PG_DSN=postgres://spreader:spreader@127.0.0.1:15432/spreader_loadtest?sslmode=disable
export SERVER_JWT_SECRET=dev-only-jwt-secret-32bytes-min
export SERVER_OTP_PEPPER=dev-only-otp-pepper
export SERVER_ARGON_PEPPER=dev-only-argon-pepper
go run ./app/cmd/server -conf app/configs/server.loadtest.yaml

# ② 冒烟/负载（并发量 = VUS，时长 = DURATION，都是你自己的旋钮）
K6_WEB_DASHBOARD=true k6 run -e VUS=10 -e DURATION=30s perf/me.js
K6_WEB_DASHBOARD=true k6 run -e VUS=20 -e DURATION=1m perf/login_mock.js
K6_WEB_DASHBOARD=true k6 run -e VUS=20 -e DURATION=30s perf/otp_send.js

# ③ 找崩溃拐点（阶梯加压；本机跑结论偏保守，标注环境）
K6_WEB_DASHBOARD=true k6 run perf/stress.js
```

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
