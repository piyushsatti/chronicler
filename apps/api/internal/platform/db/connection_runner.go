package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ConnectionRunnerFactory interface {
	Run(context.Context, *pgxpool.Conn, func(pgx.Tx) error) error
}

type ConnectionRunner struct{}

func NewConnectionRunner() *ConnectionRunner {
	return &ConnectionRunner{}
}

func (r *ConnectionRunner) Run(ctx context.Context, connection *pgxpool.Conn, fn func(pgx.Tx) error) error {
	if connection == nil {
		return errors.New("borrowed database connection is required")
	}
	if fn == nil {
		return errors.New("transaction callback is required")
	}
	tx, err := connection.Begin(ctx)
	if err != nil {
		return err
	}
	// Cancellation must not prevent rollback while the caller still owns its session lock.
	defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type productRunner[R any] struct {
	pool *Pool
	bind func(pgx.Tx) (R, error)
}

func NewProductRunner[R any](pool *Pool, bind func(pgx.Tx) (R, error)) (uow.Runner[R], error) {
	if pool == nil || pool.Pool == nil {
		return nil, errors.New("database pool is required")
	}
	if bind == nil {
		return nil, errors.New("transaction repository binder is required")
	}
	return &productRunner[R]{pool: pool, bind: bind}, nil
}

func (r *productRunner[R]) Do(ctx context.Context, fn func(R) error) error {
	if fn == nil {
		return errors.New("transaction callback is required")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck
	repos, err := r.bind(tx)
	if err != nil {
		return err
	}
	if err := fn(repos); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var _ ConnectionRunnerFactory = (*ConnectionRunner)(nil)
