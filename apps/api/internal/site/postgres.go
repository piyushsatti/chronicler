package site

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStats struct {
	q *dbgen.Queries
}

func NewPostgresStats(pool *pgxpool.Pool) *PostgresStats {
	return &PostgresStats{q: dbgen.New(pool)}
}

func (p *PostgresStats) Stats(ctx context.Context) (Stats, error) {
	n, err := p.q.CountMembersSite(ctx)
	if err != nil {
		return Stats{}, err
	}
	return Stats{TotalMembers: int(n)}, nil
}
