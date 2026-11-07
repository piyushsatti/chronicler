// Package workerrun is the background-job loop (Discord delivery, maintenance,
// question deadlines). cmd/api runs it in-process; cmd/worker runs it alone.
package workerrun

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

type workerRuntime struct {
	pool        *db.Pool
	ownsPool    bool
	store       jobs.Store
	delivery    *delivery.Handler
	maintenance *worker.MaintenanceHandler
}

// Run configures the loop and blocks until ctx is cancelled.
func Run(ctx context.Context, cfg config.Config) error {
	return RunWithPool(ctx, cfg, nil)
}

// RunWithPool reuses the caller's pool, or opens one when pool is nil.
func RunWithPool(ctx context.Context, cfg config.Config, pool *db.Pool) error {
	runtime, err := configureWorker(ctx, cfg, pool)
	if err != nil {
		return err
	}
	return serveWorker(ctx, runtime)
}

func configureWorker(ctx context.Context, cfg config.Config, pool *db.Pool) (*workerRuntime, error) {
	runtime := &workerRuntime{store: &delivery.MemoryStore{}}
	syncClient := delivery.DiscordSync(delivery.NoopSync{})
	var err error
	if pool == nil {
		pool, err = db.Connect(ctx, cfg.DatabaseURL)
		runtime.ownsPool = err == nil
	}
	if err == nil {
		runtime.pool = pool
		runtime.store = jobs.NewPostgresStore(pool.Pool)
		applier := delivery.NewPostgresRevisionApplier(pool.Pool)
		syncClient = delivery.RESTSync{
			// Token and guild are deploy secrets. The announce channel comes from
			// the admin panel; the env var is only the fallback while it is empty.
			Token: os.Getenv("DISCORD_BOT_TOKEN"), GuildID: os.Getenv("GUILD_ID"),
			FallbackChannelID: os.Getenv("DISCORD_ANNOUNCE_CHANNEL_ID"),
			FallbackOrigin:    firstOrigin(cfg.CORSOrigins),
			Settings:          applier, Quests: applier, Players: applier,
			HTTP: &http.Client{Timeout: 30 * time.Second}, Apply: applier,
			DryRun: envTruthy("DISCORD_DELIVERY_DRY_RUN"),
		}
		enqueuer := jobs.NewEnqueuer(runtime.store)
		runtime.delivery = delivery.NewHandler(runtime.store, syncClient).WithReconciler(
			delivery.NewPostgresReconciler(pool.Pool, enqueuer),
		)
		slog.Info("worker using postgres job store", "dry_run", envTruthy("DISCORD_DELIVERY_DRY_RUN"))
	} else {
		if cfg.RequireDatabase {
			return nil, fmt.Errorf("worker requires postgres: %w", err)
		}
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
			if runtime.ownsPool {
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
	for i := 0; i < 25 && ctx.Err() == nil; i++ {
		ok, err := lane.ProcessOne(ctx)
		if err != nil {
			slog.Error(name+" job failed", "error", err)
			return
		}
		if !ok {
			break
		}
	}
}

// firstOrigin is the site origin used in announcement links until an admin
// sets public_origin: the first CORS origin, which deploys set to the web origin.
func firstOrigin(origins []string) string {
	for _, origin := range origins {
		if origin != "" {
			return origin
		}
	}
	return ""
}

func envTruthy(key string) bool {
	v := os.Getenv(key)
	return v == "1" || v == "true" || v == "TRUE" || v == "yes"
}
