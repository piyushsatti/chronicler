package spatial

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dep := range []any{runner, clock, ids} {
		if product.MissingDependency(dep) {
			return nil, apierr.New(apierr.Internal, "spatial command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandPublicID(value *string) error {
	if value == nil {
		return nil
	}
	canonical, ok := product.CanonicalPublicID(*value)
	if !ok {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = canonical
	return nil
}

func runSpatialCommand[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation string,
	request auth.Request,
	spec any,
	meta product.CommandMeta,
	subjectID string,
	mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	return runSpatialAdmittedCommand(ctx, s, actor, operation, func(ProductCommandRepos, auth.Authority) (spatialAdmission, error) {
		return spatialAdmission{Request: request}, nil
	}, spec, meta, subjectID, mutate)
}

func runSpatialAdmittedCommand[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation string,
	admit func(ProductCommandRepos, auth.Authority) (spatialAdmission, error),
	spec any,
	meta product.CommandMeta,
	subjectID string,
	mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		fresh, admission, decision, err := admitSpatialCommand(ctx, repos, actor, admit)
		if err != nil {
			return err
		}
		request := admission.Request
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			return replaySpatialCommand(ctx, repos, fresh, claim, &result)
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, fresh, at)
		if err != nil {
			return err
		}
		if err := projectSpatialCommandResult(ctx, repos, fresh, &result); err != nil {
			return err
		}
		return completeSpatialCommand(ctx, repos, claim, result, decision, fresh, request, subjectID, at)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func admitSpatialCommand(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, admit func(ProductCommandRepos, auth.Authority) (spatialAdmission, error)) (auth.Authority, spatialAdmission, auth.Decision, error) {
	var admission spatialAdmission
	var zero auth.Decision
	for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
		if product.MissingDependency(dependency) {
			return auth.Authority{}, admission, zero, apierr.New(apierr.Internal, "spatial transaction dependencies required")
		}
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, admission, zero, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return auth.Authority{}, admission, zero, apierr.New(apierr.Forbidden, "member authority changed")
	}
	admission, err = admit(repos, fresh)
	if err != nil {
		return auth.Authority{}, admission, zero, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, admission.Request)
	if err != nil {
		return auth.Authority{}, admission, zero, err
	}
	if !decision.Allowed {
		return auth.Authority{}, admission, zero, apierr.New(apierr.Forbidden, "spatial command forbidden")
	}
	if admission.UsedOverride {
		decision.UsedOverride = true
		if decision.RuleCode == "" {
			decision.RuleCode = "OWNERSHIP"
		}
	}
	return fresh, admission, decision, nil
}

func replaySpatialCommand[T any](ctx context.Context, repos ProductCommandRepos, actor auth.Authority, claim idempotency.Claim, result *T) error {
	if err := json.Unmarshal(claim.Receipt, result); err != nil {
		return err
	}
	return projectSpatialCommandResult(ctx, repos, actor, result)
}

func completeSpatialCommand[T any](ctx context.Context, repos ProductCommandRepos, claim idempotency.Claim, result T, decision auth.Decision, actor auth.Authority, request auth.Request, subjectID string, at time.Time) error {
	if decision.UsedOverride {
		if product.MissingDependency(repos.Audit) {
			return apierr.New(apierr.Internal, "override recorder required")
		}
		switch view := any(result).(type) {
		case MapView:
			subjectID = view.Id
		case RegionView:
			subjectID = view.Id
		case TimeAnchorView:
			subjectID = view.Id
		}
		if err := repos.Audit.Record(ctx, claim, auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "spatial", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at}); err != nil {
			return err
		}
	}
	receipt, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return repos.Replay.Complete(ctx, claim, receipt)
}

func (s ProductCommands) CreateMap(ctx context.Context, actor auth.Authority, spec CreateMapSpec, meta product.CommandMeta) (MapView, error) {
	if spec.Input.Grid == "" {
		spec.Input.Grid = "point"
	}
	if err := validateMapCreate(spec.Input); err != nil {
		return MapView{}, err
	}
	if spec.Input.RegionId != nil {
		if err := commandPublicID(spec.Input.RegionId); err != nil {
			return MapView{}, err
		}
	}
	request, err := auth.ForMap("Mutation.createMap", auth.MapFacts{RegionID: spec.Input.RegionId})
	if err != nil {
		return MapView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "createMap", request, spec, meta, spec.Input.AtlasCode, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MapView, error) {
		locked, err := repos.Map.LockCreateMap(ctx, spec)
		if err != nil {
			return MapView{}, err
		}
		return repos.Map.StoreCreateMap(ctx, CreateMapWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UpdateMap(ctx context.Context, actor auth.Authority, spec UpdateMapSpec, meta product.CommandMeta) (MapView, error) {
	if err := validateMapUpdate(spec.Input); err != nil {
		return MapView{}, err
	}
	if err := commandPublicID(&spec.MapId); err != nil {
		return MapView{}, err
	}
	var locked UpdateMapState
	return runSpatialAdmittedCommand(ctx, s, actor, "updateMap", func(repos ProductCommandRepos, fresh auth.Authority) (spatialAdmission, error) {
		var err error
		locked, err = repos.Map.LockUpdateMap(ctx, spec)
		if err != nil {
			return spatialAdmission{}, err
		}
		if !locked.Exists {
			return spatialAdmission{}, apierr.New(apierr.NotFound, "map not found")
		}
		return mapAdmission("Mutation.updateMap", auth.MapFacts{ID: &spec.MapId, RegionID: locked.RegionID})
	}, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (MapView, error) {
		return repos.Map.StoreUpdateMap(ctx, UpdateMapWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) CreateRegion(ctx context.Context, actor auth.Authority, spec CreateRegionSpec, meta product.CommandMeta) (RegionView, error) {
	if strings.TrimSpace(spec.Input.Name) == "" || utf8.RuneCountInString(spec.Input.Name) > 200 || (spec.Input.Kind != "uncharted" && spec.Input.Kind != "archon" && spec.Input.Kind != "server") {
		return RegionView{}, apierr.New(apierr.Invalid, "invalid region input")
	}
	if spec.Input.DocumentId != nil {
		if err := commandPublicID(spec.Input.DocumentId); err != nil {
			return RegionView{}, err
		}
	}
	request, err := auth.ForOperation("Mutation.createRegion")
	if err != nil {
		return RegionView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "createRegion", request, spec, meta, spec.Input.Name, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (RegionView, error) {
		if _, err := pointcrawlDocument(ctx, repos, fresh, spec.Input.DocumentId); err != nil {
			return RegionView{}, err
		}
		locked, err := repos.Region.LockCreateRegion(ctx, spec)
		if err != nil {
			return RegionView{}, err
		}
		return repos.Region.StoreCreateRegion(ctx, CreateRegionWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UpdateRegion(ctx context.Context, actor auth.Authority, spec UpdateRegionSpec, meta product.CommandMeta) (RegionView, error) {
	if strings.TrimSpace(spec.Input.Name) == "" || utf8.RuneCountInString(spec.Input.Name) > 200 {
		return RegionView{}, apierr.New(apierr.Invalid, "region name required")
	}
	if err := commandPublicID(&spec.Id); err != nil {
		return RegionView{}, err
	}
	if spec.Input.DocumentId != nil {
		if err := commandPublicID(spec.Input.DocumentId); err != nil {
			return RegionView{}, err
		}
	}
	request, err := auth.ForRegion("Mutation.updateRegion", auth.RegionFacts{ID: spec.Id})
	if err != nil {
		return RegionView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "updateRegion", request, spec, meta, spec.Id, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (RegionView, error) {
		if _, err := pointcrawlDocument(ctx, repos, fresh, spec.Input.DocumentId); err != nil {
			return RegionView{}, err
		}
		locked, err := repos.Region.LockUpdateRegion(ctx, spec)
		if err != nil {
			return RegionView{}, err
		}
		return repos.Region.StoreUpdateRegion(ctx, UpdateRegionWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) TransitionRegion(ctx context.Context, actor auth.Authority, spec TransitionRegionSpec, meta product.CommandMeta) (RegionView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return RegionView{}, err
	}
	request, err := auth.ForOperation("Mutation.transitionRegion")
	if err != nil {
		return RegionView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "transitionRegion", request, spec, meta, spec.Id, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (RegionView, error) {
		locked, err := repos.Region.LockTransitionRegion(ctx, spec)
		if err != nil {
			return RegionView{}, err
		}
		return repos.Region.StoreTransitionRegion(ctx, TransitionRegionWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) DeleteRegion(ctx context.Context, actor auth.Authority, spec DeleteRegionSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandPublicID(&spec.RegionId); err != nil {
		return product.CommandReceipt{}, err
	}
	request, err := auth.ForRegion("Mutation.deleteRegion", auth.RegionFacts{ID: spec.RegionId})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return runSpatialCommand(ctx, s, actor, "deleteRegion", request, spec, meta, spec.RegionId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Region.LockDeleteRegion(ctx, spec)
		if err != nil {
			return product.CommandReceipt{}, err
		}
		return repos.Region.StoreDeleteRegion(ctx, DeleteRegionWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) RestoreRegion(ctx context.Context, actor auth.Authority, spec RestoreRegionSpec, meta product.CommandMeta) (RegionView, error) {
	if err := commandPublicID(&spec.RegionId); err != nil {
		return RegionView{}, err
	}
	request, err := auth.ForRegion("Mutation.restoreRegion", auth.RegionFacts{ID: spec.RegionId})
	if err != nil {
		return RegionView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "restoreRegion", request, spec, meta, spec.RegionId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (RegionView, error) {
		locked, err := repos.Region.LockRestoreRegion(ctx, spec)
		if err != nil {
			return RegionView{}, err
		}
		return repos.Region.StoreRestoreRegion(ctx, RestoreRegionWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) AssignArchon(ctx context.Context, actor auth.Authority, spec AssignArchonSpec, meta product.CommandMeta) (ArchonAssignmentView, error) {
	if err := commandPublicID(&spec.MemberId); err != nil {
		return ArchonAssignmentView{}, err
	}
	if err := commandPublicID(&spec.RegionId); err != nil {
		return ArchonAssignmentView{}, err
	}
	request, err := auth.ForOperation("Mutation.assignArchon")
	if err != nil {
		return ArchonAssignmentView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "assignArchon", request, spec, meta, spec.RegionId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (ArchonAssignmentView, error) {
		locked, err := repos.Region.LockAssignArchon(ctx, spec)
		if err != nil {
			return ArchonAssignmentView{}, err
		}
		return repos.Region.StoreAssignArchon(ctx, AssignArchonWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) RevokeArchon(ctx context.Context, actor auth.Authority, spec RevokeArchonSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandPublicID(&spec.MemberId); err != nil {
		return product.CommandReceipt{}, err
	}
	if err := commandPublicID(&spec.RegionId); err != nil {
		return product.CommandReceipt{}, err
	}
	request, err := auth.ForOperation("Mutation.revokeArchon")
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return runSpatialCommand(ctx, s, actor, "revokeArchon", request, spec, meta, spec.RegionId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Region.LockRevokeArchon(ctx, spec)
		if err != nil {
			return product.CommandReceipt{}, err
		}
		return repos.Region.StoreRevokeArchon(ctx, RevokeArchonWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) CreateTimeAnchor(ctx context.Context, actor auth.Authority, spec CreateTimeAnchorSpec, meta product.CommandMeta) (TimeAnchorView, error) {
	if err := validateTimeAnchor(spec.Input); err != nil {
		return TimeAnchorView{}, err
	}
	request, err := auth.ForOperation("Mutation.createTimeAnchor")
	if err != nil {
		return TimeAnchorView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "createTimeAnchor", request, spec, meta, "time", func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (TimeAnchorView, error) {
		locked, err := repos.Time.LockCreateTimeAnchor(ctx, spec)
		if err != nil {
			return TimeAnchorView{}, err
		}
		if err := admitLockedTimeCommand(ctx, repos, fresh, "Mutation.createTimeAnchor"); err != nil {
			return TimeAnchorView{}, err
		}
		view, err := repos.Time.StoreCreateTimeAnchor(ctx, CreateTimeAnchorWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
		if err != nil {
			return TimeAnchorView{}, err
		}
		if _, err := materializeTime(ctx, repos.Time, at); err != nil {
			return TimeAnchorView{}, err
		}
		return view, nil
	})
}

func (s ProductCommands) UpdateTimeAnchor(ctx context.Context, actor auth.Authority, spec UpdateTimeAnchorSpec, meta product.CommandMeta) (TimeAnchorView, error) {
	if err := validateTimeAnchor(spec.Input); err != nil {
		return TimeAnchorView{}, err
	}
	if err := commandPublicID(&spec.Id); err != nil {
		return TimeAnchorView{}, err
	}
	request, err := auth.ForOperation("Mutation.updateTimeAnchor")
	if err != nil {
		return TimeAnchorView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "updateTimeAnchor", request, spec, meta, spec.Id, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (TimeAnchorView, error) {
		locked, err := repos.Time.LockUpdateTimeAnchor(ctx, spec)
		if err != nil {
			return TimeAnchorView{}, err
		}
		if err := admitLockedTimeCommand(ctx, repos, fresh, "Mutation.updateTimeAnchor"); err != nil {
			return TimeAnchorView{}, err
		}
		view, err := repos.Time.StoreUpdateTimeAnchor(ctx, UpdateTimeAnchorWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
		if err != nil {
			return TimeAnchorView{}, err
		}
		if _, err := materializeTime(ctx, repos.Time, at); err != nil {
			return TimeAnchorView{}, err
		}
		return view, nil
	})
}

func (s ProductCommands) UpdateGameCalendar(ctx context.Context, actor auth.Authority, spec UpdateGameCalendarSpec, meta product.CommandMeta) (GameCalendarView, error) {
	if _, err := parseCalendarDefinition(spec.Definition); err != nil {
		return GameCalendarView{}, err
	}
	request, err := auth.ForOperation("Mutation.updateGameCalendar")
	if err != nil {
		return GameCalendarView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "updateGameCalendar", request, spec, meta, "game-calendar", func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (GameCalendarView, error) {
		locked, err := repos.Time.LockUpdateGameCalendar(ctx, spec)
		if err != nil {
			return GameCalendarView{}, err
		}
		if err := admitLockedTimeCommand(ctx, repos, fresh, "Mutation.updateGameCalendar"); err != nil {
			return GameCalendarView{}, err
		}
		return repos.Time.StoreUpdateGameCalendar(ctx, UpdateGameCalendarWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UpsertPointcrawlNode(ctx context.Context, actor auth.Authority, spec UpsertPointcrawlNodeSpec, meta product.CommandMeta) (PointcrawlNodeView, error) {
	if err := validatePointcrawlNode(spec.Input); err != nil {
		return PointcrawlNodeView{}, err
	}
	for _, id := range []*string{&spec.MapId, spec.Input.Id, spec.Input.SubmapId} {
		if err := commandPublicID(id); err != nil {
			return PointcrawlNodeView{}, err
		}
	}
	var locked UpsertPointcrawlNodeState
	return runSpatialAdmittedCommand(ctx, s, actor, "upsertPointcrawlNode", func(repos ProductCommandRepos, fresh auth.Authority) (spatialAdmission, error) {
		return admitPointcrawlNode(ctx, repos, fresh, spec, &locked)
	}, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlNodeView, error) {
		return repos.Map.StoreUpsertPointcrawlNode(ctx, UpsertPointcrawlNodeWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

// SetPointcrawlNodeState records an admin-set hex state and unlocks locked hex neighbours when mapped.
// Authority is admin-only (ruleAdmin), checked before lookup so non-admins cannot probe node existence.
func (s ProductCommands) SetPointcrawlNodeState(ctx context.Context, actor auth.Authority, spec SetPointcrawlNodeStateSpec, meta product.CommandMeta) (PointcrawlNodeView, error) {
	if !validPointcrawlNodeState(spec.State) {
		return PointcrawlNodeView{}, apierr.New(apierr.Invalid, "invalid pointcrawl node state")
	}
	for _, id := range []*string{&spec.MapId, &spec.NodeId} {
		if err := commandPublicID(id); err != nil {
			return PointcrawlNodeView{}, err
		}
	}
	request, err := auth.ForOperation("Mutation.setPointcrawlNodeState")
	if err != nil {
		return PointcrawlNodeView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "setPointcrawlNodeState", request, spec, meta, spec.NodeId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlNodeView, error) {
		locked, err := repos.Map.LockSetPointcrawlNodeState(ctx, spec)
		if err != nil {
			return PointcrawlNodeView{}, err
		}
		if !locked.Exists {
			return PointcrawlNodeView{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
		}
		return repos.Map.StoreSetPointcrawlNodeState(ctx, SetPointcrawlNodeStateWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func admitPointcrawlNode(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, spec UpsertPointcrawlNodeSpec, locked *UpsertPointcrawlNodeState) (spatialAdmission, error) {
	if product.MissingDependency(repos.Containment) {
		return spatialAdmission{}, apierr.New(apierr.Internal, "containment writer required")
	}
	if err := repos.Containment.LockContainment(ctx); err != nil {
		return spatialAdmission{}, err
	}
	ids := []string{spec.MapId}
	if spec.Input.SubmapId != nil {
		ids = append(ids, *spec.Input.SubmapId)
	}
	states, err := lockPointcrawlMaps(ctx, repos.Map, ids...)
	if err != nil {
		return spatialAdmission{}, err
	}
	*locked, err = repos.Map.LockUpsertPointcrawlNode(ctx, spec)
	if err != nil {
		return spatialAdmission{}, err
	}
	if !locked.Exists {
		return spatialAdmission{}, apierr.New(apierr.NotFound, "pointcrawl node not found")
	}
	facts := auth.MapFacts{ID: &spec.MapId, RegionID: locked.RegionID}
	if spec.Input.SubmapId != nil {
		submapID := *spec.Input.SubmapId
		edges, err := repos.Containment.ReadContainmentEdges(ctx)
		if err != nil {
			return spatialAdmission{}, err
		}
		if containmentCycle(edges, spec.MapId, submapID) {
			return spatialAdmission{}, apierr.New(apierr.Invalid, "submap containment cycle")
		}
		facts.Submap = &auth.MapRef{ID: submapID, RegionID: states[submapID].RegionID}
	}
	return mapAdmission("Mutation.upsertPointcrawlNode", facts)
}

func (s ProductCommands) SetPointcrawlEdge(ctx context.Context, actor auth.Authority, spec SetPointcrawlEdgeSpec, meta product.CommandMeta) (PointcrawlEdgeView, error) {
	spec.Input.Kind = strings.TrimSpace(spec.Input.Kind)
	if spec.Input.Kind == "" || utf8.RuneCountInString(spec.Input.Kind) > 64 || (spec.Input.Label != nil && utf8.RuneCountInString(*spec.Input.Label) > 200) || spec.Input.NodeA == spec.Input.NodeB {
		return PointcrawlEdgeView{}, apierr.New(apierr.Invalid, "invalid pointcrawl edge")
	}
	for _, id := range []*string{&spec.MapId, &spec.Input.NodeA, &spec.Input.NodeB, spec.Input.Id, spec.Input.DocumentId} {
		if err := commandPublicID(id); err != nil {
			return PointcrawlEdgeView{}, err
		}
	}
	var locked SetPointcrawlEdgeState
	return runSpatialAdmittedCommand(ctx, s, actor, "setPointcrawlEdge", func(repos ProductCommandRepos, fresh auth.Authority) (spatialAdmission, error) {
		if _, err := pointcrawlDocument(ctx, repos, fresh, spec.Input.DocumentId); err != nil {
			return spatialAdmission{}, err
		}
		var err error
		locked, err = repos.Map.LockSetPointcrawlEdge(ctx, spec)
		if err != nil {
			return spatialAdmission{}, err
		}
		if !locked.Exists {
			return spatialAdmission{}, apierr.New(apierr.NotFound, "map not found")
		}
		return mapAdmission("Mutation.setPointcrawlEdge", auth.MapFacts{ID: &spec.MapId, RegionID: locked.RegionID})
	}, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlEdgeView, error) {
		return repos.Map.StoreSetPointcrawlEdge(ctx, SetPointcrawlEdgeWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) LinkPointcrawlEntry(ctx context.Context, actor auth.Authority, spec LinkPointcrawlEntrySpec, meta product.CommandMeta) (PointcrawlEntryLinkView, error) {
	if err := validatePointcrawlRelation(spec.Relation); err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	for _, id := range []*string{&spec.MapId, &spec.NodeId, &spec.DocumentId} {
		if err := commandPublicID(id); err != nil {
			return PointcrawlEntryLinkView{}, err
		}
	}
	var locked LinkPointcrawlEntryState
	return runSpatialAdmittedCommand(ctx, s, actor, "linkPointcrawlEntry", func(repos ProductCommandRepos, fresh auth.Authority) (spatialAdmission, error) {
		admission, err := pointcrawlLinkAdmission(ctx, repos, fresh, "Mutation.linkPointcrawlEntry", spec.MapId, spec.DocumentId, spec.Relation)
		if err != nil {
			return spatialAdmission{}, err
		}
		locked, err = repos.Map.LockLinkPointcrawlEntry(ctx, spec)
		if err != nil {
			return spatialAdmission{}, err
		}
		if !locked.Exists {
			return spatialAdmission{}, apierr.New(apierr.NotFound, "map not found")
		}
		return admission, nil
	}, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlEntryLinkView, error) {
		return repos.Map.StoreLinkPointcrawlEntry(ctx, LinkPointcrawlEntryWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) UnlinkPointcrawlEntry(ctx context.Context, actor auth.Authority, spec UnlinkPointcrawlEntrySpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := validatePointcrawlRelation(spec.Relation); err != nil {
		return product.CommandReceipt{}, err
	}
	for _, id := range []*string{&spec.MapId, &spec.NodeId, &spec.DocumentId} {
		if err := commandPublicID(id); err != nil {
			return product.CommandReceipt{}, err
		}
	}
	var locked UnlinkPointcrawlEntryState
	return runSpatialAdmittedCommand(ctx, s, actor, "unlinkPointcrawlEntry", func(repos ProductCommandRepos, fresh auth.Authority) (spatialAdmission, error) {
		admission, admissionErr := pointcrawlLinkAdmission(ctx, repos, fresh, "Mutation.unlinkPointcrawlEntry", spec.MapId, spec.DocumentId, spec.Relation)
		if admissionErr != nil {
			expected, ok := errors.AsType[*apierr.Error](admissionErr)
			if !ok || (expected.Code != apierr.NotFound && expected.Code != apierr.Forbidden && expected.Code != apierr.Invalid) {
				return spatialAdmission{}, admissionErr
			}
		}
		var err error
		locked, err = repos.Map.LockUnlinkPointcrawlEntry(ctx, spec)
		if err != nil {
			return spatialAdmission{}, err
		}
		if !locked.Exists {
			return spatialAdmission{}, apierr.New(apierr.NotFound, "map not found")
		}
		if len(locked.Links) == 0 {
			return mapAdmission("Mutation.unlinkPointcrawlEntry", auth.MapFacts{ID: &spec.MapId, RegionID: locked.RegionID})
		}
		if admissionErr != nil {
			return spatialAdmission{}, admissionErr
		}
		return admission, nil
	}, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		return repos.Map.StoreUnlinkPointcrawlEntry(ctx, UnlinkPointcrawlEntryWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}
