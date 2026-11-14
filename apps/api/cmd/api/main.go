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
	"github.com/piyushsatti/chronicler/apps/api/internal/workerrun"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if len(os.Args) > 1 {
		os.Exit(runSubcommand(os.Args[1:], os.Stdout, os.Stderr))
	}
	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	if err := cfg.ValidateProduction(); err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	runtime := app.Wire(ctx, cfg)

	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, cfg)

	handler := apiHandler(mux, cfg, runtime.Authority)

	// The background-job loop shares this process and its shutdown context.
	workerDone := make(chan struct{})
	go func() {
		defer close(workerDone)
		if err := workerrun.RunWithPool(ctx, cfg, runtime.Pool); err != nil {
			slog.Error("worker stopped", "error", err)
			if ctx.Err() == nil {
				// Fail the container so Docker restarts it.
				os.Exit(1)
			}
		}
	}()

	srv := newServer(cfg, handler)
	go func() {
		slog.Info("api listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("api stopped", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	select {
	case <-workerDone:
	case <-shutdownCtx.Done():
		slog.Warn("worker did not stop before shutdown timeout")
	}
	if runtime.Pool != nil {
		runtime.Pool.Close()
	}
}

func newServer(cfg config.Config, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}

// apiHandler owns production middleware ordering. CORS must wrap every early
// application rejection so allowed browser clients receive its typed response.
func apiHandler(mux http.Handler, cfg config.Config, authority auth.AuthorityResolver) http.Handler {
	return httpserver.Chain(
		mux,
		httpserver.Recover,
		httpserver.RequestLog,
		func(next http.Handler) http.Handler {
			return httpserver.CORS(cfg.CORSOrigins, next)
		},
		httpserver.MaxBody(1<<20, "/v1/"),
		httpserver.Deadline(15*time.Second, "/v1/graphql"),
		func(next http.Handler) http.Handler {
			return auth.LiveMiddleware(login.Parser(cfg.JWTSecret), authority, next)
		},
	)
}
