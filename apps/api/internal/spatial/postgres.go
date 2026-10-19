package spatial

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresQueries struct {
	q *dbgen.Queries
}

func NewPostgresQueries(pool *pgxpool.Pool) *PostgresQueries {
	return &PostgresQueries{q: dbgen.New(pool)}
}

func (p *PostgresQueries) GameDay(ctx context.Context, realDate time.Time) (int, error) {
	var d pgtype.Date
	_ = d.Scan(realDate.Format("2006-01-02"))
	day, err := p.q.GetGameDayForRealDate(ctx, d)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return int(day), nil
}

func (p *PostgresQueries) HexHistory(ctx context.Context, hexID string, limit int) ([]HexChange, error) {
	_ = p
	_ = ctx
	if _, err := db.ParseUUID(hexID); err != nil {
		return nil, ErrNotFound
	}
	_ = limit
	return nil, nil
}

func (p *PostgresQueries) RegionCounts(ctx context.Context, regionID string) (RegionCounts, error) {
	rid, err := db.ParseUUID(regionID)
	if err != nil {
		return RegionCounts{}, ErrNotFound
	}
	quests, err := p.q.CountOpenQuestsInRegion(ctx, rid)
	if err != nil {
		return RegionCounts{}, err
	}
	return RegionCounts{Hexes: 0, OpenQuests: int(quests)}, nil
}

func (p *PostgresQueries) MapActivity(ctx context.Context, atlasCode string) (MapActivity, error) {
	_ = p
	_ = ctx
	_ = atlasCode
	return MapActivity{RecentHexChanges: 0}, nil
}
