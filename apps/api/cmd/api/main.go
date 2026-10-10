package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.FromEnv()

	ctx := context.Background()
	runtime := app.Wire(ctx, cfg)

	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)

	limiter := httpserver.NewRateLimit(time.Minute, 30, "/v1/quests")
	handler := httpserver.Chain(
		mux,
		httpserver.Recover,
		httpserver.RequestLog,
		limiter.Middleware,
		httpserver.MaxBody(1<<20, "/v1/"),
		func(next http.Handler) http.Handler {
			return auth.Middleware(login.Parser(cfg.JWTSecret), next)
		},
		func(next http.Handler) http.Handler {
			return httpserver.CORS(cfg.CORSOrigins, next)
		},
	)

	srv := &http.Server{Addr: cfg.Addr, Handler: handler}
	go func() {
		slog.Info("api listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("api stopped", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	if runtime.Pool != nil {
		runtime.Pool.Close()
	}
}
