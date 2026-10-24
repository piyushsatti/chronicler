package worker

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ExecutionGate interface {
	Do(context.Context, string, jobs.Receipt, func(context.Context, jobs.ExecutionScope) error) (bool, error)
}

type AdvisoryExecutionGate struct {
	Pool  *pgxpool.Pool
	Clock product.Clock
}

func NewExecutionGate(pool *pgxpool.Pool, clock product.Clock) (*AdvisoryExecutionGate, error) {
	if pool == nil || clock == nil {
		return nil, errors.New("execution gate requires a pool and clock")
	}
	return &AdvisoryExecutionGate{Pool: pool, Clock: clock}, nil
}

func (g *AdvisoryExecutionGate) Do(ctx context.Context, kind string, receipt jobs.Receipt, fn func(context.Context, jobs.ExecutionScope) error) (acquired bool, err error) {
	if g == nil || g.Pool == nil || g.Clock == nil || ctx == nil || kind == "" || fn == nil {
		return false, errors.New("execution gate requires initialized dependencies, context, kind and callback")
	}
	budget, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	conn, acquireErr := g.Pool.Acquire(budget)
	if acquireErr != nil {
		return false, errors.Join(errors.New("execution gate connection acquisition failed"), budget.Err())
	}
	key := maintenanceLockID(kind)
	// A failed acquisition reply cannot establish whether the server took the lock.
	uncertain := true
	defer func() {
		if cleanupErr := releaseExecutionConnection(conn, key, acquired, uncertain); cleanupErr != nil {
			err = errors.Join(err, cleanupErr)
		}
	}()
	if lockErr := conn.QueryRow(budget, "SELECT pg_try_advisory_lock($1)", key).Scan(&acquired); lockErr != nil {
		return false, errors.Join(errors.New("execution gate lock acquisition failed"), budget.Err())
	}
	uncertain = false
	if !acquired {
		return false, nil
	}
	err = fn(budget, jobs.ExecutionScope{Receipt: receipt, Connection: conn})
	if err == nil {
		err = budget.Err()
	}
	return true, err
}

func releaseExecutionConnection(conn *pgxpool.Conn, key int64, acquired, uncertain bool) error {
	cleanup, done := context.WithTimeout(context.Background(), 3*time.Second)
	defer done()
	if uncertain {
		return hijackExecutionConnection(conn, cleanup)
	}
	if !acquired {
		conn.Release()
		return nil
	}
	var unlocked bool
	unlockErr := conn.QueryRow(cleanup, "SELECT pg_advisory_unlock($1)", key).Scan(&unlocked)
	if unlockErr != nil || !unlocked {
		cleanupErr := hijackExecutionConnection(conn, cleanup)
		return errors.Join(cleanupErr, errors.New("execution gate lock cleanup failed"))
	}
	conn.Release()
	return nil
}

func hijackExecutionConnection(conn *pgxpool.Conn, cleanup context.Context) error {
	raw := conn.Hijack()
	_ = raw.Close(cleanup)
	select {
	case <-raw.PgConn().CleanupDone():
		return nil
	case <-cleanup.Done():
		return errors.New("execution gate connection cleanup failed")
	}
}

func maintenanceLockID(kind string) int64 {
	digest := sha256.Sum256([]byte("chronicler:maintenance:v1\x00" + kind))
	return int64(binary.BigEndian.Uint64(digest[:8]))
}

var _ ExecutionGate = (*AdvisoryExecutionGate)(nil)
