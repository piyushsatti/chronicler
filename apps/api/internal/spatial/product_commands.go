package spatial

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
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
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "spatial command dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "spatial command dependencies required")
			}
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandDependencyMissing(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

func commandPublicID(value *string) error {
	if value == nil {
		return nil
	}
	parsed, err := uuid.Parse(*value)
	if err != nil || parsed == uuid.Nil || !strings.EqualFold(parsed.String(), *value) {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = parsed.String()
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
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "spatial transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "spatial command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
			}
			return nil
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, fresh, at)
		if err != nil {
			return err
		}
		if decision.UsedOverride {
			if commandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, auth.OverrideFact{
				ActorID:     fresh.Claims().MemberID,
				Operation:   request.Operation(),
				SubjectType: "spatial",
				SubjectID:   subjectID,
				RuleCode:    decision.RuleCode,
				At:          at,
			}); err != nil {
				return err
			}
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func (s ProductCommands) CreateMap(ctx context.Context, actor auth.Authority, spec CreateMapSpec, meta product.CommandMeta) (MapView, error) {
	if strings.TrimSpace(spec.Input.AtlasCode) == "" || strings.TrimSpace(spec.Input.Name) == "" {
		return MapView{}, apierr.New(apierr.Invalid, "invalid map input")
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

func (s ProductCommands) CreateRegion(ctx context.Context, actor auth.Authority, spec CreateRegionSpec, meta product.CommandMeta) (RegionView, error) {
	if strings.TrimSpace(spec.Input.Name) == "" || strings.TrimSpace(spec.Input.Kind) == "" {
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
	request, err := auth.ForOperation("Mutation.createTimeAnchor")
	if err != nil {
		return TimeAnchorView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "createTimeAnchor", request, spec, meta, "time", func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (TimeAnchorView, error) {
		locked, err := repos.Time.LockCreateTimeAnchor(ctx, spec)
		if err != nil {
			return TimeAnchorView{}, err
		}
		return repos.Time.StoreCreateTimeAnchor(ctx, CreateTimeAnchorWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UpdateTimeAnchor(ctx context.Context, actor auth.Authority, spec UpdateTimeAnchorSpec, meta product.CommandMeta) (TimeAnchorView, error) {
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
		return repos.Time.StoreUpdateTimeAnchor(ctx, UpdateTimeAnchorWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UpdateGameCalendar(ctx context.Context, actor auth.Authority, spec UpdateGameCalendarSpec, meta product.CommandMeta) (GameCalendarView, error) {
	if len(spec.Definition) == 0 || !json.Valid(spec.Definition) {
		return GameCalendarView{}, apierr.New(apierr.Invalid, "invalid calendar definition")
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
	if err := commandPublicID(&spec.MapId); err != nil {
		return PointcrawlNodeView{}, err
	}
	if spec.Input.Id != nil {
		if err := commandPublicID(spec.Input.Id); err != nil {
			return PointcrawlNodeView{}, err
		}
	}
	if spec.Input.SubmapId != nil {
		if err := commandPublicID(spec.Input.SubmapId); err != nil {
			return PointcrawlNodeView{}, err
		}
	}
	mapID := spec.MapId
	request, err := auth.ForMap("Mutation.upsertPointcrawlNode", auth.MapFacts{ID: &mapID})
	if err != nil {
		return PointcrawlNodeView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "upsertPointcrawlNode", request, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlNodeView, error) {
		if err := repos.Containment.LockContainment(ctx); err != nil {
			return PointcrawlNodeView{}, err
		}
		locked, err := repos.Map.LockUpsertPointcrawlNode(ctx, spec)
		if err != nil {
			return PointcrawlNodeView{}, err
		}
		return repos.Map.StoreUpsertPointcrawlNode(ctx, UpsertPointcrawlNodeWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) SetPointcrawlEdge(ctx context.Context, actor auth.Authority, spec SetPointcrawlEdgeSpec, meta product.CommandMeta) (PointcrawlEdgeView, error) {
	if err := commandPublicID(&spec.MapId); err != nil {
		return PointcrawlEdgeView{}, err
	}
	if err := commandPublicID(&spec.Input.NodeA); err != nil {
		return PointcrawlEdgeView{}, err
	}
	if err := commandPublicID(&spec.Input.NodeB); err != nil {
		return PointcrawlEdgeView{}, err
	}
	if spec.Input.Id != nil {
		if err := commandPublicID(spec.Input.Id); err != nil {
			return PointcrawlEdgeView{}, err
		}
	}
	mapID := spec.MapId
	request, err := auth.ForMap("Mutation.setPointcrawlEdge", auth.MapFacts{ID: &mapID})
	if err != nil {
		return PointcrawlEdgeView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "setPointcrawlEdge", request, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlEdgeView, error) {
		locked, err := repos.Map.LockSetPointcrawlEdge(ctx, spec)
		if err != nil {
			return PointcrawlEdgeView{}, err
		}
		return repos.Map.StoreSetPointcrawlEdge(ctx, SetPointcrawlEdgeWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) LinkPointcrawlEntry(ctx context.Context, actor auth.Authority, spec LinkPointcrawlEntrySpec, meta product.CommandMeta) (PointcrawlEntryLinkView, error) {
	if err := commandPublicID(&spec.MapId); err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	if err := commandPublicID(&spec.NodeId); err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	if err := commandPublicID(&spec.DocumentId); err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	mapID := spec.MapId
	request, err := auth.ForMap("Mutation.linkPointcrawlEntry", auth.MapFacts{ID: &mapID})
	if err != nil {
		return PointcrawlEntryLinkView{}, err
	}
	return runSpatialCommand(ctx, s, actor, "linkPointcrawlEntry", request, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (PointcrawlEntryLinkView, error) {
		locked, err := repos.Map.LockLinkPointcrawlEntry(ctx, spec)
		if err != nil {
			return PointcrawlEntryLinkView{}, err
		}
		return repos.Map.StoreLinkPointcrawlEntry(ctx, LinkPointcrawlEntryWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}

func (s ProductCommands) UnlinkPointcrawlEntry(ctx context.Context, actor auth.Authority, spec UnlinkPointcrawlEntrySpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandPublicID(&spec.MapId); err != nil {
		return product.CommandReceipt{}, err
	}
	if err := commandPublicID(&spec.NodeId); err != nil {
		return product.CommandReceipt{}, err
	}
	if err := commandPublicID(&spec.DocumentId); err != nil {
		return product.CommandReceipt{}, err
	}
	mapID := spec.MapId
	request, err := auth.ForMap("Mutation.unlinkPointcrawlEntry", auth.MapFacts{ID: &mapID})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return runSpatialCommand(ctx, s, actor, "unlinkPointcrawlEntry", request, spec, meta, spec.MapId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Map.LockUnlinkPointcrawlEntry(ctx, spec)
		if err != nil {
			return product.CommandReceipt{}, err
		}
		return repos.Map.StoreUnlinkPointcrawlEntry(ctx, UnlinkPointcrawlEntryWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: spec,
			Locked:         locked,
		})
	})
}
