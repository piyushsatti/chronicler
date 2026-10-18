package spatial

import (
	"context"
	"errors"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"

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

func int4(v pgtype.Int4) int {
	if !v.Valid {
		return 0
	}
	return int(v.Int32)
}

func (p *PostgresQueries) MapByAtlas(ctx context.Context, code string) (LegacyMapView, error) {
	row, err := p.q.GetMapByAtlasCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LegacyMapView{}, ErrNotFound
		}
		return LegacyMapView{}, err
	}
	return LegacyMapView{
		ID:        db.UUIDString(row.ID),
		Name:      row.Name,
		AtlasCode: row.AtlasCode,
		Family:    row.Family,
		RegionID:  db.UUIDString(row.RegionID),
	}, nil
}

func (p *PostgresQueries) ListMaps(ctx context.Context, family *string) ([]LegacyMapView, error) {
	rows, err := p.q.ListMaps(ctx, db.OptString(family))
	if err != nil {
		return nil, err
	}
	out := make([]LegacyMapView, 0, len(rows))
	for _, row := range rows {
		out = append(out, LegacyMapView{
			ID:        db.UUIDString(row.ID),
			Name:      row.Name,
			AtlasCode: row.AtlasCode,
			Family:    row.Family,
			RegionID:  db.UUIDString(row.RegionID),
		})
	}
	return out, nil
}

func (p *PostgresQueries) ListRegions(ctx context.Context, kind *string) ([]Region, error) {
	rows, err := p.q.ListRegions(ctx, db.OptString(kind))
	if err != nil {
		return nil, err
	}
	out := make([]Region, 0, len(rows))
	for _, row := range rows {
		out = append(out, Region{
			ID:   db.UUIDString(row.ID),
			Name: row.Name,
			Kind: row.Kind,
		})
	}
	return out, nil
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

func mapHex(id, mapID pgtype.UUID, col, row int32, terrain, elevation, climate pgtype.Text) Hex {
	return Hex{
		ID:        db.UUIDString(id),
		MapID:     db.UUIDString(mapID),
		Col:       int(col),
		Row:       int(row),
		Terrain:   db.TextOrEmpty(terrain),
		Elevation: db.TextOrEmpty(elevation),
		Climate:   db.TextOrEmpty(climate),
	}
}

func (p *PostgresQueries) HexAt(ctx context.Context, mapID string, col, row int) (Hex, error) {
	_ = p
	_ = ctx
	_ = mapID
	_ = col
	_ = row
	return Hex{}, ErrNotFound
}

func (p *PostgresQueries) MapViewPage(ctx context.Context, scope document.ViewerScope, atlasCode string, limit, offset int) (MapViewPage, error) {
	m, err := p.MapByAtlas(ctx, atlasCode)
	if err != nil {
		return MapViewPage{}, err
	}
	_ = scope
	return MapViewPage{Map: m, Places: []MapPlace{}, TotalPlaces: 0}, nil
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
