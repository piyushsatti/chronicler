package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const LaneMaintenance = "maintenance"

var errUnknownMaintenanceKind = errors.New("UNKNOWN_MAINTENANCE_KIND")
var errMaintenanceBusy = errors.New("JOB_BUSY")

type TimeFillWriter interface {
	FillFuture(context.Context, jobs.ExecutionScope, product.Date, int32) (int32, error)
}

// MaintenanceHandler runs scheduled background jobs from the work table.
type MaintenanceHandler struct {
	store      jobs.Store
	gate       ExecutionGate
	timeWriter TimeFillWriter
	clock      product.Clock
}

func NewMaintenanceHandler(store jobs.Store, gate ExecutionGate, timeWriter TimeFillWriter, clock product.Clock) (*MaintenanceHandler, error) {
	for _, dependency := range []any{store, gate, timeWriter, clock} {
		if dependency == nil {
			return nil, errors.New("maintenance dependencies required")
		}
		value := reflect.ValueOf(dependency)
		if (value.Kind() == reflect.Pointer || value.Kind() == reflect.Func || value.Kind() == reflect.Interface) && value.IsNil() {
			return nil, errors.New("maintenance dependencies required")
		}
	}
	return &MaintenanceHandler{store: store, gate: gate, timeWriter: timeWriter, clock: clock}, nil
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
		return h.runMaintenanceJob(ctx, job)
	})
	if errRun != nil {
		if errors.Is(errRun, errUnknownMaintenanceKind) {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.RepairRequired, errRun.Error())
		}
		if errors.Is(errRun, errMaintenanceBusy) {
			return true, h.store.Retry(ctx, job.Receipt(), time.Second, "JOB_BUSY")
		}
		code := maintenanceFailureCode(errRun)
		if job.Attempts >= jobs.MaxAttempts {
			return true, h.store.Fail(ctx, job.Receipt(), jobs.Dead, code)
		}
		return true, h.store.Retry(ctx, job.Receipt(), jobs.Backoff(job.Attempts), code)
	}
	if err := h.store.Succeed(ctx, job.Receipt()); err != nil {
		return true, err
	}
	slog.InfoContext(ctx, "maintenance job succeeded", "kind", job.Kind, "key", job.Key)
	return true, nil
}

func (h *MaintenanceHandler) runMaintenanceJob(ctx context.Context, job jobs.Job) error {
	if job.Kind != "gametime_fill" && job.Kind != "reconcile_dry_run" {
		return errUnknownMaintenanceKind
	}
	acquired, err := h.gate.Do(ctx, job.Kind, job.Receipt(), func(ctx context.Context, scope jobs.ExecutionScope) error {
		return h.executeMaintenanceJob(ctx, job.Kind, scope)
	})
	if err == nil && !acquired {
		return errMaintenanceBusy
	}
	return err
}

func (h *MaintenanceHandler) executeMaintenanceJob(ctx context.Context, kind string, scope jobs.ExecutionScope) error {
	if kind == "reconcile_dry_run" {
		return h.reconcileDryRun(ctx, scope)
	}
	at, err := product.UTCNow(h.clock)
	if err != nil {
		return err
	}
	_, err = h.timeWriter.FillFuture(ctx, scope, product.Date(at.Format("2006-01-02")), 30)
	return err
}

func maintenanceFailureCode(err error) string {
	if failure, ok := errors.AsType[*apierr.Error](err); ok && failure.Code == apierr.Invalid {
		return "JOB_INVARIANT_FAILED"
	}
	if errors.Is(err, jobs.ErrLease) {
		return "JOB_LEASE_LOST"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "JOB_TIMEOUT"
	}
	return "JOB_EXECUTION_FAILED"
}

func (h *MaintenanceHandler) reconcileDryRun(ctx context.Context, scope jobs.ExecutionScope) error {
	if scope.Connection == nil {
		return errors.New("reconciliation requires the borrowed connection")
	}
	q := dbgen.New(scope.Connection)
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
	slot = slot.UTC()
	slotKey := slot.Format("2006-01-02T15:04")
	for _, spec := range []struct {
		key, kind string
	}{
		{"maintenance:gametime:" + slot.Format("2006-01-02"), "gametime_fill"},
		{"maintenance:reconcile:" + slot.Format("2006-01-02"), "reconcile_dry_run"},
	} {
		payload, _ := json.Marshal(map[string]string{"slot": slotKey})
		_, err := store.EnqueueScheduled(ctx, jobs.Job{
			Key: spec.key, Kind: spec.kind, Lane: LaneMaintenance, Payload: payload,
		})
		if err != nil {
			slog.ErrorContext(ctx, "maintenance admission failed", "kind", spec.kind, "key", spec.key, "error", err)
		}
	}
}
