package spatial

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dep := range []any{reads.Map, reads.Region, reads.Time, reads.Batch, policy, clock, overrideReads} {
		if product.MissingDependency(dep) {
			return nil, apierr.New(apierr.Internal, "spatial query dependencies required")
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func (s ProductQueries) admit(ctx context.Context, actor auth.Authority, operation auth.Operation) error {
	request, err := auth.ForOperation(operation)
	if err != nil {
		return err
	}
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "spatial read forbidden")
	}
	if decision.UsedOverride {
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		s.OverrideReads.Observe(ctx, auth.OverrideFact{
			ActorID:   actor.Claims().MemberID,
			Operation: request.Operation(),
			RuleCode:  decision.RuleCode,
			At:        at,
		})
	}
	return nil
}

func spatialQueryPage(limit, offset int32) error {
	if !product.ValidPage(limit, offset) {
		return apierr.New(apierr.Invalid, "invalid page")
	}
	return nil
}

func (s ProductQueries) RenderStoredGameDate(gameDay *int32, definition *json.RawMessage) (*product.GameDateView, error) {
	if gameDay == nil {
		return nil, nil
	}
	if definition == nil {
		return nil, apierr.New(apierr.Internal, "stored calendar definition unavailable")
	}
	parsed, err := parseCalendarDefinition(*definition)
	if err != nil {
		return nil, apierr.New(apierr.Internal, "stored calendar definition invalid")
	}
	view, err := renderCalendarDate(*gameDay, parsed)
	if err != nil {
		return nil, apierr.New(apierr.Internal, "stored game date cannot be rendered")
	}
	return &view, nil
}

func (s ProductQueries) ArchonAssignments(ctx context.Context, actor auth.Authority, spec ArchonAssignmentsSpec) (ArchonPage, error) {
	if err := spatialQueryPage(spec.Limit, spec.Offset); err != nil {
		return ArchonPage{}, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.archonAssignments")); err != nil {
		return ArchonPage{}, err
	}
	return s.Reads.Region.ReadArchonAssignments(ctx, actor, spec)
}

func (s ProductQueries) RegionCounts(ctx context.Context, actor auth.Authority, spec RegionCountsSpec) (*RegionCountsView, error) {
	if strings.TrimSpace(spec.RegionId) == "" {
		return nil, apierr.New(apierr.Invalid, "invalid public id")
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.regionCounts")); err != nil {
		return nil, err
	}
	return s.Reads.Region.ReadRegionCounts(ctx, actor, spec)
}

func (s ProductQueries) RegionActivity(ctx context.Context, actor auth.Authority, spec RegionActivitySpec) (*RegionActivityView, error) {
	if strings.TrimSpace(spec.AtlasCode) == "" {
		return nil, apierr.New(apierr.Invalid, "invalid atlas code")
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.regionActivity")); err != nil {
		return nil, err
	}
	return s.Reads.Region.ReadRegionActivity(ctx, actor, spec)
}

func (s ProductQueries) GameCalendar(ctx context.Context, actor auth.Authority, spec GameCalendarSpec) (GameCalendarView, error) {
	from, fromErr := time.Parse("2006-01-02", string(spec.RealFrom))
	to, toErr := time.Parse("2006-01-02", string(spec.RealTo))
	if fromErr != nil || toErr != nil || !from.Before(to) || to.Sub(from) > 366*24*time.Hour {
		return GameCalendarView{}, apierr.New(apierr.Invalid, "invalid calendar date range")
	}
	asOf, err := product.UTCNow(s.Clock)
	if err != nil {
		return GameCalendarView{}, err
	}
	spec.AsOf = asOf
	if err := s.admit(ctx, actor, auth.Operation("Query.gameCalendar")); err != nil {
		return GameCalendarView{}, err
	}
	snapshot, err := s.Reads.Time.ReadGameCalendar(ctx, actor, spec)
	if err != nil {
		return GameCalendarView{}, err
	}
	cells := make([]GameDayCellView, len(snapshot.Cells))
	copy(cells, snapshot.Cells)
	return GameCalendarView{
		CurrentGameDay: snapshot.CurrentGameDay,
		Definition:     snapshot.Definition,
		MonthGrid:      cells,
	}, nil
}

func (s ProductQueries) GameDate(ctx context.Context, actor auth.Authority, spec GameDateSpec) (*product.GameDateView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.gameDate")); err != nil {
		return nil, err
	}
	snapshot, err := s.Reads.Time.ReadGameDate(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	return s.RenderStoredGameDate(snapshot.GameDay, snapshot.Definition)
}

func (s ProductQueries) RealDates(ctx context.Context, actor auth.Authority, spec RealDatesSpec) (RealDatePage, error) {
	if err := spatialQueryPage(spec.Limit, spec.Offset); err != nil {
		return RealDatePage{}, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.realDates")); err != nil {
		return RealDatePage{}, err
	}
	return s.Reads.Time.ReadRealDates(ctx, actor, spec)
}

func (s ProductQueries) TimeAnchors(ctx context.Context, actor auth.Authority, spec TimeAnchorsSpec) (TimeAnchorPage, error) {
	if err := spatialQueryPage(spec.Limit, spec.Offset); err != nil {
		return TimeAnchorPage{}, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.timeAnchors")); err != nil {
		return TimeAnchorPage{}, err
	}
	return s.Reads.Time.ReadTimeAnchors(ctx, actor, spec)
}

func (s ProductQueries) Regions(ctx context.Context, actor auth.Authority, spec RegionsSpec) ([]RegionView, error) {
	if err := spatialQueryPage(spec.Limit, spec.Offset); err != nil {
		return nil, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.regions")); err != nil {
		return nil, err
	}
	views, err := s.Reads.Region.ReadRegions(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	regionIDs := make([]string, len(views))
	for i, view := range views {
		regionIDs[i] = view.Id
	}
	s.Policy, err = s.Policy.WithArchonAssignments(ctx, actor, regionIDs)
	if err != nil {
		return nil, err
	}
	for i := range views {
		if err := s.setRegionCapability(ctx, actor, &views[i]); err != nil {
			return nil, err
		}
	}
	return views, nil
}

func (s ProductQueries) Maps(ctx context.Context, actor auth.Authority, spec MapsSpec) ([]MapView, error) {
	if err := spatialQueryPage(spec.Limit, spec.Offset); err != nil {
		return nil, err
	}
	if err := s.admit(ctx, actor, auth.Operation("Query.maps")); err != nil {
		return nil, err
	}
	views, err := s.Reads.Map.ReadMaps(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	regionIDs := make([]string, 0, len(views))
	for _, view := range views {
		if view.RegionId != nil {
			regionIDs = append(regionIDs, *view.RegionId)
		}
	}
	s.Policy, err = s.Policy.WithArchonAssignments(ctx, actor, regionIDs)
	if err != nil {
		return nil, err
	}
	for i := range views {
		if err := s.setMapCapability(ctx, actor, &views[i]); err != nil {
			return nil, err
		}
	}
	return views, nil
}

func (s ProductQueries) BatchMapNodes(ctx context.Context, actor auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error) {
	return s.Reads.Batch.ReadBatchMapNodes(ctx, actor, keys)
}

func (s ProductQueries) BatchMapNodeEdges(ctx context.Context, actor auth.Authority, keys []MapNodeEdgesKey) ([]product.BatchResult[NodeEdgeList], error) {
	return s.Reads.Batch.ReadBatchMapNodeEdges(ctx, actor, keys)
}

func (s ProductQueries) BatchNodeLinks(ctx context.Context, actor auth.Authority, keys []NodeLinksKey) ([]product.BatchResult[NodeLinkList], error) {
	return s.Reads.Batch.ReadBatchNodeLinks(ctx, actor, keys)
}

func (s ProductQueries) Map(ctx context.Context, actor auth.Authority, spec MapSpec) (*MapView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.map")); err != nil {
		return nil, err
	}
	view, err := s.Reads.Map.ReadMap(ctx, actor, spec)
	if err != nil || view == nil {
		return view, err
	}
	if err := s.setMapCapability(ctx, actor, view); err != nil {
		return nil, err
	}
	return view, nil
}
