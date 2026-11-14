package dbtest

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

type StatementCounter struct {
	n atomic.Int64
}

func (c *StatementCounter) Count() int64 { return c.n.Load() }

func (c *StatementCounter) Reset() { c.n.Store(0) }

func (c *StatementCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	c.n.Add(1)
	return ctx
}

func (c *StatementCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

// ConnectCounted excludes the readiness ping from the count so callers measure only their work.
func ConnectCounted(ctx context.Context, databaseURL string) (*db.Pool, *StatementCounter, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("parse database url: %w", err)
	}
	counter := &StatementCounter{}
	cfg.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("ping: %w", err)
	}
	counter.Reset()
	return &db.Pool{Pool: pool}, counter, nil
}
