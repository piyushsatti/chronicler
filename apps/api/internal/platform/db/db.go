package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type Pool struct {
	*pgxpool.Pool
}

func Connect(ctx context.Context, databaseURL string) (*Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Pool{Pool: pool}, nil
}

// TxRunner is a unit of work over a single pgx transaction.
// R is built from the transaction by bind.
type TxRunner[R any] struct {
	pool *Pool
	bind func(pgx.Tx) R
}

func NewRunner[R any](pool *Pool, bind func(pgx.Tx) R) uow.Runner[R] {
	return &TxRunner[R]{pool: pool, bind: bind}
}

func (r *TxRunner[R]) Do(ctx context.Context, fn func(repos R) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := fn(r.bind(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
