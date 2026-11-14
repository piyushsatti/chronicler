package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type Pool struct {
	*pgxpool.Pool
}

type ConnectOption func(*pgxpool.Config)

func WithStatementTimeout(d time.Duration) ConnectOption {
	return func(cfg *pgxpool.Config) {
		if cfg.ConnConfig.RuntimeParams == nil {
			cfg.ConnConfig.RuntimeParams = map[string]string{}
		}
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = d.String()
	}
}

func ConnectOptions(env string) []ConnectOption {
	if env != "production" {
		return nil
	}
	return []ConnectOption{WithStatementTimeout(10 * time.Second)}
}

func Connect(ctx context.Context, databaseURL string, opts ...ConnectOption) (*Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	for _, opt := range opts {
		opt(cfg)
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
	defer tx.Rollback(context.WithoutCancel(ctx)) //nolint:errcheck

	if err := fn(r.bind(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
