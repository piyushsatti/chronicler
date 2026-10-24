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
	if err := runWorker(context.Background(), config.FromEnv()); err != nil {
		slog.Error("worker stopped", "error", err)
	}
}

type workerRuntime struct {
	pool        *db.Pool
	store       jobs.Store
	delivery    *delivery.Handler
	maintenance *worker.MaintenanceHandler
}

func runWorker(parent context.Context, cfg config.Config) error {
	runtime, err := configureWorker(parent, cfg)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(parent, syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	return serveWorker(ctx, runtime)
}

func configureWorker(ctx context.Context, cfg config.Config) (*workerRuntime, error) {
	runtime := &workerRuntime{store: &delivery.MemoryStore{}}
	syncClient := delivery.DiscordSync(delivery.NoopSync{})
	if pool, err := db.Connect(ctx, cfg.DatabaseURL); err == nil {
		runtime.pool = pool
		runtime.store = jobs.NewPostgresStore(pool.Pool)
		applier := delivery.NewPostgresRevisionApplier(pool.Pool)
		syncClient = delivery.RESTSync{
			Token: os.Getenv("DISCORD_BOT_TOKEN"), ChannelID: os.Getenv("DISCORD_ANNOUNCE_CHANNEL_ID"),
			HTTP: &http.Client{Timeout: 30 * time.Second}, Apply: applier, Messages: applier,
			DryRun: envTruthy("DISCORD_DELIVERY_DRY_RUN"),
		}
		enqueuer := jobs.NewEnqueuer(runtime.store)
		runtime.delivery = delivery.NewHandler(runtime.store, syncClient).WithReconciler(
			delivery.NewPostgresReconciler(pool.Pool, enqueuer),
		)
		slog.Info("worker using postgres job store", "dry_run", envTruthy("DISCORD_DELIVERY_DRY_RUN"))
	} else {
		slog.Warn("worker using in-memory job store", "error", err)
		runtime.delivery = delivery.NewHandler(runtime.store, syncClient)
	}
	if runtime.pool != nil {
		maintenance, err := configureMaintenance(runtime.pool, runtime.store)
		if err != nil {
			return nil, err
		}
		runtime.maintenance = maintenance
	}
	return runtime, nil
}

func configureMaintenance(pool *db.Pool, store jobs.Store) (*worker.MaintenanceHandler, error) {
	clock := product.Clock(time.Now)
	gate, err := worker.NewExecutionGate(pool.Pool, clock)
	if err != nil {
		return nil, err
	}
	timeWriter, err := spatial.NewTimeFillWriter(clock, db.NewConnectionRunner())
	if err != nil {
		return nil, err
	}
	return worker.NewMaintenanceHandler(store, gate, timeWriter, clock)
}

func serveWorker(ctx context.Context, runtime *workerRuntime) error {

	lanes := []string{delivery.LaneDiscord}
	if runtime.maintenance != nil {
		lanes = append(lanes, worker.LaneMaintenance)
	}
	slog.Info("worker started", "lanes", lanes)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Deadline sweeping has independent progress even while a lane performs slow I/O.
	sweepDone := make(chan struct{})
	if runtime.pool != nil {
		go func() {
			defer close(sweepDone)
			worker.RunQuestionDeadlineSweep(ctx, jobs.NewPostgresStore(runtime.pool.Pool))
		}()
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
			if runtime.pool != nil {
				runtime.pool.Close()
			}
			return nil
		case <-ticker.C:
			processWorkerLanes(ctx, runtime)
		case <-schedule.C:
			if runtime.pool != nil {
				worker.RunScheduled(ctx, runtime.pool.Pool, runtime.store)
			}
		}
	}
}

func processWorkerLanes(ctx context.Context, runtime *workerRuntime) {
	if ctx.Err() != nil {
		return
	}
	processWorkerLane(ctx, runtime.delivery, "discord")
	if runtime.maintenance != nil && ctx.Err() == nil {
		processWorkerLane(ctx, runtime.maintenance, "maintenance")
	}
}

type workerLane interface {
	ProcessOne(context.Context) (bool, error)
}

func processWorkerLane(ctx context.Context, lane workerLane, name string) {
	ok, err := lane.ProcessOne(ctx)
	if err != nil {
		slog.Error(name+" job failed", "error", err)
		return
	}
	if !ok {
		return
	}
}

func envTruthy(key string) bool {
	v := os.Getenv(key)
	return v == "1" || v == "true" || v == "TRUE" || v == "yes"
}
