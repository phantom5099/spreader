# spreader

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

## 许可

MIT License，详见 [LICENSE](LICENSE)。
