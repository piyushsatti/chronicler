package spatial

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

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
