package spatial

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type TimeFillWriter struct {
	Clock            product.Clock
	ConnectionRunner db.ConnectionRunnerFactory
}

func NewTimeFillWriter(clock product.Clock, connectionRunner db.ConnectionRunnerFactory) (*TimeFillWriter, error) {
	if clock == nil || commandDependencyMissing(connectionRunner) {
		return nil, apierr.New(apierr.Internal, "time fill dependencies required")
	}
	return &TimeFillWriter{Clock: clock, ConnectionRunner: connectionRunner}, nil
}

func (w *TimeFillWriter) FillFuture(ctx context.Context, scope jobs.ExecutionScope, from product.Date, days int32) (int32, error) {
	start, err := time.Parse("2006-01-02", string(from))
	if err != nil || days < 1 || days > 366 {
		return 0, apierr.New(apierr.Invalid, "invalid time fill range")
	}
	if w == nil || w.Clock == nil || commandDependencyMissing(w.ConnectionRunner) || scope.Connection == nil {
		return 0, apierr.New(apierr.Internal, "time fill dependencies required")
	}
	end := start.AddDate(0, 0, int(days))
	var changed int32
	err = w.ConnectionRunner.Run(ctx, scope.Connection, func(tx pgx.Tx) error {
		guard, err := jobs.NewEffectGuard(tx)
		if err != nil {
			return err
		}
		permit, err := guard.Admit(ctx, scope.Receipt)
		if err != nil {
			return err
		}
		if permit.Kind() != "gametime_fill" {
			return apierr.New(apierr.Conflict, "job kind cannot authorize time effects")
		}
		at, err := product.UTCNow(w.Clock)
		if err != nil {
			return err
		}
		today, _ := time.Parse("2006-01-02", at.Format("2006-01-02"))
		if start.Before(today) {
			start = today
		}
		changed, err = fillFutureProjection(ctx, tx, start, end)
		if err != nil {
			return err
		}
		return guard.Recheck(ctx, permit)
	})
	if err != nil {
		return 0, err
	}
	return changed, nil
}

func fillFutureProjection(ctx context.Context, tx pgx.Tx, start, end time.Time) (int32, error) {
	if !start.Before(end) {
		return 0, nil
	}
	p, err := NewProductPostgres(tx)
	if err != nil {
		return 0, err
	}
	first, last := product.Date(start.Format("2006-01-02")), product.Date(end.Format("2006-01-02"))
	anchors, err := p.LockTimeProjection(ctx, first, last)
	if err != nil {
		return 0, err
	}
	cells, err := projectTimeCells(first, last, anchors)
	if err != nil {
		return 0, err
	}
	return p.StoreTimeProjection(ctx, first, last, cells)
}
