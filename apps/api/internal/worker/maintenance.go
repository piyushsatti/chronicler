package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

const LaneMaintenance = "maintenance"

var errUnknownMaintenanceKind = errors.New("UNKNOWN_MAINTENANCE_KIND")

// MaintenanceHandler runs scheduled background jobs from the work table.
type MaintenanceHandler struct {
	store jobs.Store
	pool  *pgxpool.Pool
}

func NewMaintenanceHandler(store jobs.Store, pool *pgxpool.Pool) *MaintenanceHandler {
	return &MaintenanceHandler{store: store, pool: pool}
}

func (h *MaintenanceHandler) ProcessOne(ctx context.Context) (bool, error) {
	job, err := h.store.ClaimOne(ctx, LaneMaintenance)
	if err != nil {
		return false, err
	}
	if job.ID == "" {
		return false, nil
	}
	errRun := jobs.RunLeased(ctx, h.store, job, func(ctx context.Context) error {
		var errRun error
		switch job.Kind {
		case "gametime_fill":
			errRun = h.gametimeFill(ctx)
		case "reconcile_dry_run":
			errRun = h.reconcileDryRun(ctx)
		default:
			return errUnknownMaintenanceKind
		}
		return errRun
	})
	if errRun != nil {
		if errors.Is(errRun, errUnknownMaintenanceKind) {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.RepairRequired, errRun.Error())
		}
		if job.Attempts >= jobs.MaxAttempts {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, errRun.Error())
		}
		return true, h.store.Retry(ctx, job.Receipt(), jobs.Backoff(job.Attempts), errRun.Error())
	}
	if err := h.store.Succeed(ctx, job.Receipt()); err != nil {
		return true, err
	}
	slog.InfoContext(ctx, "maintenance job succeeded", "kind", job.Kind, "key", job.Key)
	return true, nil
}

func (h *MaintenanceHandler) gametimeFill(ctx context.Context) error {
	q := dbgen.New(h.pool)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	var d pgtype.Date
	_ = d.Scan(today.Format("2006-01-02"))
	day, err := q.GetGameDayForRealDate(ctx, d)
	if err == nil && day > 0 {
		return nil
	}
	// Seed a monotonic day when missing (preview/staging helper).
	next := int32(time.Now().UTC().Unix() / 86400)
	return q.UpsertGameTimeMapDay(ctx, dbgen.UpsertGameTimeMapDayParams{
		RealDate: d,
		GameDay:  next,
	})
}

func (h *MaintenanceHandler) reconcileDryRun(ctx context.Context) error {
	q := dbgen.New(h.pool)
	members, err := q.CountMembers(ctx)
	if err != nil {
		return err
	}
	site, err := q.CountMembersSite(ctx)
	if err != nil {
		return err
	}
	if int(members) != int(site) {
		slog.WarnContext(ctx, "reconcile drift: member counts differ", "members", members, "active_site", site)
	} else {
		slog.InfoContext(ctx, "reconcile ok", "members", members)
	}
	return nil
}

// EnqueueDailyMaintenance queues the two active maintenance job kinds.
func EnqueueDailyMaintenance(ctx context.Context, store jobs.Store, slot time.Time) {
	if store == nil {
		return
	}
	slotKey := slot.UTC().Format("2006-01-02T15:04")
	for _, spec := range []struct {
		key, kind string
	}{
		{"maintenance:gametime:" + slot.Format("2006-01-02"), "gametime_fill"},
		{"maintenance:reconcile:" + slot.Format("2006-01-02"), "reconcile_dry_run"},
	} {
		payload, _ := json.Marshal(map[string]string{"slot": slotKey})
		_ = store.Enqueue(ctx, jobs.Job{
			Key: spec.key, Kind: spec.kind, Lane: LaneMaintenance, Payload: payload,
		})
	}
}
