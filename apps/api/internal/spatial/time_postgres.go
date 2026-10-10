package spatial

import (
	"context"
	"time"
)

// PostgresTimeMap adapts PostgresQueries to the REST TimeMap interface.
type PostgresTimeMap struct {
	Queries *PostgresQueries
}

func (p PostgresTimeMap) GameDay(realDate time.Time) (int, error) {
	if p.Queries == nil {
		return EmptyTimeMap{}.GameDay(realDate)
	}
	day, err := p.Queries.GameDay(context.Background(), realDate)
	if err != nil {
		return 0, err
	}
	if day == 0 {
		return EmptyTimeMap{}.GameDay(realDate)
	}
	return day, nil
}

func (p PostgresTimeMap) RealDates(gameDay int) ([]time.Time, error) {
	_ = gameDay
	return nil, nil
}
