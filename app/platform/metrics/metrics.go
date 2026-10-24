// Package metrics 应用级可观测：路由级 RED 指标、管理端点（/metrics + pprof）、
// PG 连接池指标与业务事件计数器。
// label 红线：只允许 operation/status 等低基数维度——user_id、完整 URL 严禁入 label，否则时间序列爆炸会杀死 Prometheus。
package metrics

import (
	"net/http"
	"strconv"
	"time"

	_ "net/http/pprof" // 注册 /debug/pprof/* 到 DefaultServeMux（随管理端点暴露，仅回环/受控地址）

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "server_http_requests_total",
		Help: "HTTP 请求总数（按 operation 与状态码；429 属限流正常态，5xx 才是故障）。",
	}, []string{"operation", "status"})

	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "server_http_request_duration_seconds",
		Help:    "HTTP 请求耗时分布（分桶后可算 P50/P95/P99；平均值会说谎，分位数不会）。",
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
	}, []string{"operation"})

	businessTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "server_business_events_total",
		Help: "业务事件计数（登录成败原因/封禁/RT 重放/撤销等；异动 = 被滥用或被攻击的信号）。",
	}, []string{"event", "reason"})
)

// Filter 单条路由的 RED 指标。
// operation 由注册方显式传入（如 "POST /v1/auth/login"）：不从请求 URL 取值，
// 否则任意路径扫描都会生成新 label，直接把时间序列打爆。
func Filter(operation string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(sw, r)
			httpRequests.WithLabelValues(operation, strconv.Itoa(sw.status())).Inc()
			httpDuration.WithLabelValues(operation).Observe(time.Since(start).Seconds())
		})
	}
}

// statusWriter 记录实际写出的状态码；handler 不显式 WriteHeader 时为 200。
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.code == 0 {
		w.code = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.code == 0 {
		w.code = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

// Unwrap 让 http.ResponseController 能拿到底层 writer（流式/长连接需要）。
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusWriter) status() int {
	if w.code == 0 {
		return http.StatusOK
	}
	return w.code
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
		Name: "server_pg_pool_conns",
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
