package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.FromEnv()

	var store jobs.Store = &delivery.MemoryStore{}
	var sync delivery.DiscordSync = delivery.NoopSync{}
	var pool *db.Pool
	var handler *delivery.Handler

	if p, err := db.Connect(context.Background(), cfg.DatabaseURL); err == nil {
		pool = p
		store = jobs.NewPostgresStore(p.Pool)
		applier := delivery.NewPostgresRevisionApplier(p.Pool)
		sync = delivery.RESTSync{
			Token:     os.Getenv("DISCORD_BOT_TOKEN"),
			ChannelID: os.Getenv("DISCORD_ANNOUNCE_CHANNEL_ID"),
			HTTP:      &http.Client{Timeout: 30 * time.Second},
			Apply:     applier,
			Messages:  applier,
			DryRun:    envTruthy("DISCORD_DELIVERY_DRY_RUN"),
		}
		enqueuer := jobs.NewEnqueuer(store)
		handler = delivery.NewHandler(store, sync).WithReconciler(
			delivery.NewPostgresReconciler(p.Pool, enqueuer),
		)
		slog.Info("worker using postgres job store", "dry_run", envTruthy("DISCORD_DELIVERY_DRY_RUN"))
	} else {
		slog.Warn("worker using in-memory job store", "error", err)
		handler = delivery.NewHandler(store, sync)
	}

	var maintenance *worker.MaintenanceHandler
	if pool != nil {
		clock := product.Clock(time.Now)
		gate, err := worker.NewExecutionGate(pool.Pool, clock)
		if err != nil {
			slog.Error("maintenance configuration failed", "error", err)
			return
		}
		timeWriter, err := spatial.NewTimeFillWriter(clock, db.NewConnectionRunner())
		if err != nil {
			slog.Error("maintenance configuration failed", "error", err)
			return
		}
		maintenance, err = worker.NewMaintenanceHandler(store, gate, timeWriter, clock)
		if err != nil {
			slog.Error("maintenance configuration failed", "error", err)
			return
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	lanes := []string{delivery.LaneDiscord}
	if maintenance != nil {
		lanes = append(lanes, worker.LaneMaintenance)
	}
	slog.Info("worker started", "lanes", lanes)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Deadline sweeping has independent progress even while a lane performs slow I/O.
	sweepDone := make(chan struct{})
	if pool != nil {
		go func() { defer close(sweepDone); worker.RunQuestionDeadlineSweep(ctx, jobs.NewPostgresStore(pool.Pool)) }()
	} else {
		close(sweepDone)
	}

	schedule := time.NewTicker(time.Hour)
	defer schedule.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("worker shutting down")
			<-sweepDone
			if pool != nil {
				pool.Close()
			}
			return
		case <-ticker.C:
			for range 1 {
				if ctx.Err() != nil {
					break
				}
				ok, err := handler.ProcessOne(ctx)
				if err != nil {
					slog.Error("discord job failed", "error", err)
					break
				}
				if !ok {
					break
				}
			}
			if maintenance != nil {
				for range 1 {
					if ctx.Err() != nil {
						break
					}
					ok, err := maintenance.ProcessOne(ctx)
					if err != nil {
						slog.Error("maintenance job failed", "error", err)
						break
					}
					if !ok {
						break
					}
				}
			}
		case <-schedule.C:
			if pool != nil {
				worker.RunScheduled(ctx, pool.Pool, store)
			}
		}
	}
}

func envTruthy(key string) bool {
	v := os.Getenv(key)
	return v == "1" || v == "true" || v == "TRUE" || v == "yes"
}
