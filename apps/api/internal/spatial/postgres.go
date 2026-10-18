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
		Cols:      int4(row.Cols),
		Rows:      int4(row.Rows),
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
			Cols:      int4(row.Cols),
			Rows:      int4(row.Rows),
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
	mid, err := db.ParseUUID(mapID)
	if err != nil {
		return Hex{}, ErrNotFound
	}
	rowData, err := p.q.GetHexByMapColRow(ctx, dbgen.GetHexByMapColRowParams{
		MapID: mid,
		Col:   int32(col),
		Row:   int32(row),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Hex{}, ErrNotFound
		}
		return Hex{}, err
	}
	return mapHex(rowData.ID, rowData.MapID, rowData.Col, rowData.Row, rowData.Terrain, rowData.Elevation, rowData.Climate), nil
}

func (p *PostgresQueries) MapViewPage(ctx context.Context, scope document.ViewerScope, atlasCode string, limit, offset int) (MapViewPage, error) {
	m, err := p.MapByAtlas(ctx, atlasCode)
	if err != nil {
		return MapViewPage{}, err
	}
	viewer := document.SQLScope(scope)
	total, err := p.q.CountMapPlaces(ctx, dbgen.CountMapPlacesParams{
		AtlasCode: atlasCode, ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return MapViewPage{}, err
	}
	rows, err := p.q.ListMapPlaces(ctx, dbgen.ListMapPlacesParams{
		AtlasCode: atlasCode,
		RowLimit:  int32(limit), RowOffset: int32(offset),
		ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return MapViewPage{}, err
	}
	places := make([]MapPlace, 0, len(rows))
	for _, row := range rows {
		places = append(places, MapPlace{
			HexID:      db.UUIDString(row.HexID),
			Col:        int(row.Col),
			Row:        int(row.Row),
			DocumentID: db.UUIDString(row.DocumentID),
			Slug:       row.Slug,
			Title:      row.Title,
			Category:   row.Category,
		})
	}
	overridden := false
	for _, row := range rows {
		overridden = overridden || row.AdminOverride
	}
	document.AuditSQLOverride(ctx, scope, overridden, "map_places", "list")
	document.AuditSQLOverride(ctx, scope, total.AdminOverride, "map_places", "count")
	return MapViewPage{Map: m, Places: places, TotalPlaces: int(total.Total)}, nil
}

func (p *PostgresQueries) HexHistory(ctx context.Context, hexID string, limit int) ([]HexChange, error) {
	hid, err := db.ParseUUID(hexID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := p.q.ListHexChanges(ctx, dbgen.ListHexChangesParams{
		HexID:    hid,
		RowLimit: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]HexChange, 0, len(rows))
	for _, ch := range rows {
		out = append(out, HexChange{
			ID:        db.UUIDString(ch.ID),
			HexID:     db.UUIDString(ch.HexID),
			Kind:      ch.Kind,
			Payload:   ch.Payload,
			CreatedAt: ch.CreatedAt.Time,
		})
	}
	return out, nil
}

func (p *PostgresQueries) RegionCounts(ctx context.Context, regionID string) (RegionCounts, error) {
	rid, err := db.ParseUUID(regionID)
	if err != nil {
		return RegionCounts{}, ErrNotFound
	}
	hexes, err := p.q.CountRegionHexes(ctx, rid)
	if err != nil {
		return RegionCounts{}, err
	}
	quests, err := p.q.CountOpenQuestsInRegion(ctx, rid)
	if err != nil {
		return RegionCounts{}, err
	}
	return RegionCounts{Hexes: int(hexes), OpenQuests: int(quests)}, nil
}

func (p *PostgresQueries) MapActivity(ctx context.Context, atlasCode string) (MapActivity, error) {
	n, err := p.q.CountRecentHexChangesForMap(ctx, atlasCode)
	if err != nil {
		return MapActivity{}, err
	}
	return MapActivity{RecentHexChanges: int(n)}, nil
}
