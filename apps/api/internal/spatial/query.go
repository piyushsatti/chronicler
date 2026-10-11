package spatial

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

var ErrNotFound = apierr.New(apierr.NotFound, "spatial entity not found")

type MapView struct {
	ID         string
	Name       string
	AtlasCode  string
	Family     string
	RegionID   string
	Cols, Rows int
}

type Region struct {
	ID   string
	Name string
	Kind string
}

type Queries struct {
	DocumentScope  func(context.Context) (document.ViewerScope, error)
	MapByAtlas     func(ctx context.Context, code string) (MapView, error)
	ListMapsFn     func(ctx context.Context, family *string) ([]MapView, error)
	ListRegionsFn  func(ctx context.Context, kind *string) ([]Region, error)
	GameDay        func(ctx context.Context, realDate time.Time) (int, error)
	MapViewFn      func(ctx context.Context, scope document.ViewerScope, atlasCode string, limit, offset int) (MapViewPage, error)
	HexFn          func(ctx context.Context, mapID string, col, row int) (Hex, error)
	RegionCountsFn func(ctx context.Context, regionID string) (RegionCounts, error)
	MapActivityFn  func(ctx context.Context, atlasCode string) (MapActivity, error)
	HexHistoryFn   func(ctx context.Context, hexID string, limit int) ([]HexChange, error)
}

func (q Queries) Map(ctx context.Context, atlasCode string) (MapView, error) {
	if q.MapByAtlas == nil {
		return MapView{}, ErrNotFound
	}
	return q.MapByAtlas(ctx, atlasCode)
}

func (q Queries) ListMaps(ctx context.Context, family *string) ([]MapView, error) {
	if q.ListMapsFn == nil {
		return nil, nil
	}
	return q.ListMapsFn(ctx, family)
}

func (q Queries) ListRegions(ctx context.Context, kind *string) ([]Region, error) {
	if q.ListRegionsFn == nil {
		return nil, nil
	}
	return q.ListRegionsFn(ctx, kind)
}

func (q Queries) MapView(ctx context.Context, atlasCode string, limit, offset int) (MapViewPage, error) {
	if q.MapViewFn == nil {
		return MapViewPage{}, ErrNotFound
	}
	scope := document.ViewerScope{Anonymous: true}
	if q.DocumentScope != nil {
		var err error
		scope, err = q.DocumentScope(ctx)
		if err != nil {
			return MapViewPage{}, err
		}
	}
	return q.MapViewFn(ctx, scope, atlasCode, limit, offset)
}

func (q Queries) Hex(ctx context.Context, mapID string, col, row int) (Hex, error) {
	if q.HexFn == nil {
		return Hex{}, ErrNotFound
	}
	return q.HexFn(ctx, mapID, col, row)
}

func (q Queries) RegionCounts(ctx context.Context, regionID string) (RegionCounts, error) {
	if q.RegionCountsFn == nil {
		return RegionCounts{}, ErrNotFound
	}
	return q.RegionCountsFn(ctx, regionID)
}

func (q Queries) MapActivity(ctx context.Context, atlasCode string) (MapActivity, error) {
	if q.MapActivityFn == nil {
		return MapActivity{}, ErrNotFound
	}
	return q.MapActivityFn(ctx, atlasCode)
}

func (q Queries) HexHistory(ctx context.Context, hexID string, limit int) ([]HexChange, error) {
	if q.HexHistoryFn == nil {
		return nil, nil
	}
	return q.HexHistoryFn(ctx, hexID, limit)
}
