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

// run 装配并运行进程，返回退出码（defer 在此全部收敛）。
func run() int {
	confPath := flag.String("conf", "configs/server.yaml", "config file path")
	httpAddr := flag.String("http", "", "http listen address (overrides config)")
	flag.Parse()
	if v := os.Getenv("SERVER_CONF"); v != "" {
		*confPath = v
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

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
				if cerr := infra.CleanupExpired(ctx); cerr != nil {
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
	hs := khttp.NewServer(
		khttp.Address(httpListen),
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
