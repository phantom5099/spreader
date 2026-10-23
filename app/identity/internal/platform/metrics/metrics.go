// Package metrics 应用级可观测：RED 中间件、管理端点（/metrics + pprof）、
// PG 连接池指标与业务事件计数器。
// label 红线：只允许 operation/status 等低基数维度——user_id、完整 URL 严禁入 label，否则时间序列爆炸会杀死 Prometheus。
package metrics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	_ "net/http/pprof" // 注册 /debug/pprof/* 到 DefaultServeMux（随管理端点暴露，仅回环/受控地址）

	kerrors "github.com/go-kratos/kratos/v3/errors"
	"github.com/go-kratos/kratos/v3/middleware"
	"github.com/go-kratos/kratos/v3/transport"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "identity_http_requests_total",
		Help: "HTTP 请求总数（按 operation 与状态码；429 属限流正常态，5xx 才是故障）。",
	}, []string{"operation", "status"})

	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "identity_http_request_duration_seconds",
		Help:    "HTTP 请求耗时分布（分桶后可算 P50/P95/P99；平均值会说谎，分位数不会）。",
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
	}, []string{"operation"})

	businessTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "identity_business_events_total",
		Help: "业务事件计数（登录成败原因/封禁/RT 重放/撤销等；异动 = 被滥用或被攻击的信号）。",
	}, []string{"event", "reason"})
)

// Middleware RED 指标中间件：请求结束时按 operation 写计数与耗时。
// operation 来自 proto 注解生成的方法名（如 /v1/auth/IdentityService/Login），天然低基数。
func Middleware() middleware.Middleware {
	return func(handler middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (any, error) {
			op := "unknown"
			if tr, ok := transport.FromServerContext(ctx); ok {
				op = tr.Operation()
			}
			start := time.Now()
			reply, err := handler(ctx, req)
			code := 200
			if err != nil {
				code = kerrors.Code(err)
			}
			httpRequests.WithLabelValues(op, strconv.Itoa(code)).Inc()
			httpDuration.WithLabelValues(op).Observe(time.Since(start).Seconds())
			return reply, err
		}
	}
}

// BusinessEvent 业务事件计数（在 platform/eventlog 的事件出口处调用，与外部依赖可用性无关）。
func BusinessEvent(event, reason string) {
	businessTotal.WithLabelValues(event, reason).Inc()
}

// ServeAdmin 管理端点：/metrics（Prometheus 抓取）+ /debug/pprof/*（诊断）。
// 安全纪律：addr 仅绑回环或受控网段（集群环境由部署配置放宽给采集器），严禁公网。
func ServeAdmin(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	// pprof 处理器注册在 DefaultServeMux 上，转发前缀即可
	mux.Handle("/debug/pprof/", http.DefaultServeMux)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 3 * time.Second}
	go func() { _ = srv.ListenAndServe() }()
	return srv
}

// RegisterPGPool 注册 PG 连接池指标（快照函数由持有方提供，15s 采样一次）。
func RegisterPGPool(snap func() (total, idle, acquired, limit int)) {
	g := promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "identity_pg_pool_conns",
		Help: "PG 连接池状态（饱和 = 慢查询/连接泄漏的前兆）。",
	}, []string{"state"})
	go func() {
		for {
			t, i, a, capV := snap()
			g.WithLabelValues("total").Set(float64(t))
			g.WithLabelValues("idle").Set(float64(i))
			g.WithLabelValues("acquired").Set(float64(a))
			g.WithLabelValues("limit").Set(float64(capV))
			time.Sleep(15 * time.Second)
		}
	}()
}
