package site

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type siteStatsQueries interface {
	CountMembersSite(ctx context.Context) (int32, error)
	SiteCommunitySnapshot(ctx context.Context) ([]dbgen.SiteCommunitySnapshotRow, error)
}

type PostgresStats struct {
	q siteStatsQueries
}

func NewPostgresStats(pool *pgxpool.Pool) *PostgresStats {
	return &PostgresStats{q: dbgen.New(pool)}
}

func (p *PostgresStats) Stats(ctx context.Context) (Stats, error) {
	n, err := p.q.CountMembersSite(ctx)
	if err != nil {
		return Stats{}, err
	}
	rows, err := p.q.SiteCommunitySnapshot(ctx)
	if err != nil {
		return Stats{}, err
	}
	snapshot, err := mapCommunitySnapshot(rows)
	if err != nil {
		return Stats{}, err
	}
	// CountMembersSite is active members; the snapshot's total_members counts every row.
	return Stats{
		TotalMembers:     int(n),
		ActiveCharacters: int(snapshot.ActiveCharacters),
		TotalQuests:      int(snapshot.TotalQuests),
	}, nil
}
