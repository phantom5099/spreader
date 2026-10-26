// server 进程入口：加载配置、建立基础设施、装配模块、托管生命周期。
// 只做装配与开关，业务规则一律在模块内部。
package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	kratos "github.com/go-kratos/kratos/v3"
	_ "github.com/go-kratos/kratos/v3/encoding/json" // 注册 application/json codec：Bind/Result 依赖它
	khttp "github.com/go-kratos/kratos/v3/transport/http"

	"github.com/phantom5099/spreader/app/identity"
	"github.com/phantom5099/spreader/app/platform/config"
	"github.com/phantom5099/spreader/app/platform/httpx"
	"github.com/phantom5099/spreader/app/platform/metrics"
)

func main() {
	os.Exit(run())
}

const (
	// defaultRequestTimeout 请求总预算兜底：配置缺省时的上界。
	// 必须大于 login 包内最宽的 budgetExternal（8s），否则路由级预算会被外层提前截断。
	defaultRequestTimeout = 10 * time.Second
	// cleanupTimeout 单轮过期数据清理的上界：正常 <1s，超时只是防挂死。
	cleanupTimeout = 5 * time.Minute
)

// run 装配并运行进程，返回退出码（defer 在此全部收敛）。
func run() int {
	confPath := flag.String("conf", "", "config file path (required unless SERVER_CONF is set)")
	httpAddr := flag.String("http", "", "http listen address (overrides config)")
	flag.Parse()
	if v := os.Getenv("SERVER_CONF"); v != "" {
		*confPath = v
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if *confPath == "" {
		log.Error("config path required: pass -conf or set SERVER_CONF")
		return 1
	}

	cfg, err := config.Load(*confPath)
	if err != nil {
		log.Error("load config", "err", err)
		return 1
	}
	production := strings.ToLower(config.Env("APP_ENV")) == "production"
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// ── 基础设施 ──────────────────────────────────────────────
	infra, err := identity.OpenInfra(ctx, cfg)
	if err != nil {
		log.Error("infra", "err", err)
		return 1
	}
	defer infra.Close()

	// ── 管理端点：/metrics + /debug/pprof（严禁公网；集群环境放宽给采集器）──
	metrics.ServeAdmin(firstNonEmptyStr(cfg.Metrics.Addr, "127.0.0.1:9100"))
	metrics.RegisterPGPool(infra.PGPoolStats)

	go func() { // 过期数据清理：每 6 小时一轮
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				// 每轮独立超时：清理卡在慢库上必须能自行退出，否则这个 goroutine 再也回不到 ctx.Done()。
				cctx, ccancel := context.WithTimeout(ctx, cleanupTimeout)
				cerr := infra.CleanupExpired(cctx)
				ccancel()
				if cerr != nil {
					log.Error("cleanup expired", "err", cerr)
				}
			}
		}
	}()

	// ── 模块装配 ──────────────────────────────────────────────
	mod, err := identity.New(identity.Deps{Config: cfg, Infra: infra, Log: log, Production: production})
	if err != nil {
		log.Error("identity", "err", err)
		return 1
	}

	// ── HTTP ─────────────────────────────────────────────────
	// 解析顺序：flag > 配置文件 > 内置兜底。
	httpListen := *httpAddr
	if httpListen == "" {
		httpListen = firstNonEmptyStr(cfg.Server.HTTPAddr, "127.0.0.1:8000")
	}
	reqTimeout := requestTimeout(cfg)
	if reqTimeout < identity.MaxRequestBudget {
		// 配置小于最宽的路由预算时，路由内部设的 deadline 永远不会先到，等于白设。
		log.Warn("request timeout below widest route budget: route budgets will be truncated",
			"configured", reqTimeout.String(), "required_min", identity.MaxRequestBudget.String())
	}
	hs := khttp.NewServer(
		khttp.Address(httpListen),
		// 请求总预算上界。kratos 默认仅 1s，而 SendOtp 路径要跑 6-7 次 Redis + 一次（可能降级的
		// 两次）外部短信/邮件调用，1s 必然超时。此处只做兜底，各路由的真实预算在 login/handler.go 内收窄。
		khttp.Timeout(reqTimeout),
		// 手写路由不走 kratos 的 ctx.Middleware 链，横切设施必须挂在 net/http 层（Filter）。
		// metrics 是 per-route 的（见 identity.Register），这里只剩 panic 兜底。
		khttp.Filter(httpx.Recovery(log)),
		khttp.ErrorEncoder(httpx.ProblemEncoder()),
	)
	mod.Register(hs)
	// 进程级健康检查：与业务路径分开，探针不占用模块的 URL 命名空间。
	hs.Route("").GET("/healthz", func(ctx khttp.Context) error {
		return ctx.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	app := kratos.New(
		kratos.Name("spreader"),
		kratos.Context(ctx),
		kratos.Server(hs),
	)
	if err := app.Run(); err != nil {
		log.Error("app run", "err", err)
		return 1
	}
	return 0
}

// firstNonEmptyStr 返回第一个非空字符串（配置兜底链）。
func firstNonEmptyStr(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

// requestTimeout 请求总预算：配置优先，缺省取兜底上界。
// 各路由必须在此值之内自行收窄（见 login 的 budgetLocal / budgetExternal）。
func requestTimeout(cfg *config.Config) time.Duration {
	if s := cfg.Server.RequestTimeoutSeconds; s > 0 {
		return time.Duration(s) * time.Second
	}
	return defaultRequestTimeout
}
