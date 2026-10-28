package spatial

import (
	"context"
	"errors"
	"math"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type spatialAdmission struct {
	Request      auth.Request
	UsedOverride bool
}

func projectSpatialCommandResult[T any](ctx context.Context, repos ProductCommandRepos, actor auth.Authority, result *T) error {
	switch view := any(result).(type) {
	case *MapView:
		return (ProductQueries{Policy: repos.Policy}).setMapCapability(ctx, actor, view)
	case *RegionView:
		if err := (ProductQueries{Policy: repos.Policy}).setRegionCapability(ctx, actor, view); err != nil {
			return err
		}
		if view.DocumentId == nil {
			return nil
		}
		_, err := pointcrawlDocument(ctx, repos, actor, view.DocumentId)
		if expected, ok := errors.AsType[*apierr.Error](err); ok && (expected.Code == apierr.NotFound || expected.Code == apierr.Forbidden) {
			view.DocumentId = nil
			return nil
		}
		return err
	}
	return nil
}

func mapAdmission(operation auth.Operation, facts auth.MapFacts) (spatialAdmission, error) {
	request, err := auth.ForMap(operation, facts)
	return spatialAdmission{Request: request}, err
}

func pointcrawlDocument(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, documentID *string) (*document.DocumentView, error) {
	if documentID == nil {
		return nil, nil
	}
	if product.MissingDependency(repos.Documents) {
		return nil, apierr.New(apierr.Internal, "document reference reader required")
	}
	view, err := repos.Documents.ReadCommandDocument(ctx, actor, *documentID)
	if err != nil {
		return nil, err
	}
	if view.DeletedAt != nil {
		return nil, apierr.New(apierr.NotFound, "document not found")
	}
	return &view, nil
}

func pointcrawlLinkAdmission(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, mapID, documentID, relation string) (spatialAdmission, error) {
	ref, err := repos.Map.ReadMapReference(ctx, mapID)
	if err != nil {
		return spatialAdmission{}, err
	}
	view, err := pointcrawlDocument(ctx, repos, actor, &documentID)
	if err != nil {
		return spatialAdmission{}, err
	}
	if relation == "subject" && document.IsFeature(view) {
		return spatialAdmission{}, apierr.New(apierr.Invalid, "a Feature is placed on the map by its hex number")
	}
	facts := auth.MapFacts{ID: &ref.ID, RegionID: ref.RegionID}
	var override bool
	if relation == "location" {
		if ref.RegionID == nil {
			return spatialAdmission{}, apierr.New(apierr.Invalid, "location links require a region")
		}
		if product.MissingDependency(repos.Locations) {
			return spatialAdmission{}, apierr.New(apierr.Internal, "location admission required")
		}
		location, err := repos.Locations.AdmitLocationLink(ctx, actor, documentID, *ref.RegionID)
		if err != nil {
			return spatialAdmission{}, err
		}
		facts.Locations = []auth.DocumentWriteFacts{{ID: view.Id, AuthorID: view.AuthorId, Kind: view.Kind, Category: view.Category, LinkedRegionIDs: location.LinkedRegionIDs}}
		override = location.UsedOverride
	}
	admission, err := mapAdmission(operation, facts)
	admission.UsedOverride = override
	return admission, err
}

func (p *ProductPostgres) ReadMapReference(ctx context.Context, mapID string) (auth.MapRef, error) {
	id, err := spatialPublicID(mapID)
	if err != nil {
		return auth.MapRef{}, err
	}
	row, err := p.queries().ReadProductMapReference(ctx, id)
	if isNotFound(err) {
		return auth.MapRef{}, apierr.New(apierr.NotFound, "map not found")
	}
	if err != nil {
		return auth.MapRef{}, err
	}
	return auth.MapRef{ID: db.UUIDString(row.MapID), RegionID: uuidPtr(row.RegionID)}, nil
}

func (p *ProductPostgres) lockPointcrawlMap(ctx context.Context, mapID string) (*MapView, error) {
	if _, err := p.ReadMapReference(ctx, mapID); err != nil {
		return nil, err
	}
	id, err := spatialPublicID(mapID)
	if err != nil {
		return nil, err
	}
	view, err := readMapByPublicID(ctx, p.queries(), id)
	if err != nil {
		return nil, err
	}
	if view == nil || view.MapKind != "pointcrawl" {
		return nil, apierr.New(apierr.NotFound, "pointcrawl map not found")
	}
	return view, nil
}

func (p *ProductPostgres) lockPointcrawlNode(ctx context.Context, nodeID, mapID string) (PointcrawlNodeView, error) {
	id, err := spatialPublicID(nodeID)
	if err != nil {
		return PointcrawlNodeView{}, err
	}
	row, err := p.queries().LockProductPointcrawlNode(ctx, id)
	if err != nil {
		return PointcrawlNodeView{}, spatialWriteError(err)
	}
	if db.UUIDString(row.MapPublicID) != mapID {
		return PointcrawlNodeView{}, apierr.New(apierr.Invalid, "node belongs to another map")
	}
	return mapPointcrawlNodeRow(row.PublicID, row.MapPublicID, row.Name, row.X, row.Y, row.SubmapPublicID, row.CreatedAt), nil
}

func validMapGrid(grid string) bool {
	return grid == "point" || grid == "hex"
}

func validateMapUpdate(input MapUpdateFields) error {
	if strings.TrimSpace(input.Name) == "" || utf8.RuneCountInString(input.Name) > 200 ||
		strings.TrimSpace(input.Family) == "" || utf8.RuneCountInString(input.Family) > 200 ||
		!validMapGrid(input.Grid) {
		return apierr.New(apierr.Invalid, "invalid map input")
	}
	return validateMapAssetPath(input.AssetPath)
}

func validateMapCreate(input MapCreateFields) error {
	if !validMapIdentity(input) {
		return apierr.New(apierr.Invalid, "invalid map input")
	}
	if !validMapDimensions(input) {
		return apierr.New(apierr.Invalid, "invalid map dimensions")
	}
	return validateMapAssetPath(input.AssetPath)
}

func validMapIdentity(input MapCreateFields) bool {
	return strings.TrimSpace(input.Name) != "" && utf8.RuneCountInString(input.Name) <= 200 &&
		strings.TrimSpace(input.AtlasCode) != "" && utf8.RuneCountInString(input.AtlasCode) <= 64 &&
		input.MapKind == "pointcrawl" && validMapGrid(input.Grid) && strings.TrimSpace(input.Family) != ""
}

func validMapDimensions(input MapCreateFields) bool {
	for _, dimension := range []*int32{input.Cols, input.Rows} {
		if dimension != nil && (*dimension < 1 || *dimension > 1000) {
			return false
		}
	}
	return true
}

func validateMapAssetPath(path *string) error {
	if path == nil {
		return nil
	}
	value := *path
	u, err := url.Parse(value)
	if err != nil || utf8.RuneCountInString(value) > 2048 || strings.Contains(value, "\\") || u.User != nil || u.Opaque != "" {
		return apierr.New(apierr.Invalid, "invalid map asset path")
	}
	if (!strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//")) && (u.Scheme != "https" || u.Host == "") {
		return apierr.New(apierr.Invalid, "invalid map asset path")
	}
	for _, segment := range strings.Split(u.Path, "/") {
		if segment == ".." {
			return apierr.New(apierr.Invalid, "invalid map asset path")
		}
	}
	return nil
}

func validatePointcrawlNode(input PointcrawlNodeFields) error {
	if strings.TrimSpace(input.Name) == "" || utf8.RuneCountInString(input.Name) > 200 || math.IsNaN(input.X) || math.IsInf(input.X, 0) || math.IsNaN(input.Y) || math.IsInf(input.Y, 0) {
		return apierr.New(apierr.Invalid, "invalid pointcrawl node")
	}
	return nil
}

func validatePointcrawlRelation(relation string) error {
	if relation != "location" && relation != "subject" {
		return apierr.New(apierr.Invalid, "invalid pointcrawl entry relation")
	}
	return nil
}

func containmentCycle(edges []ContainmentEdge, parentID, childID string) bool {
	children := make(map[string][]string)
	for _, edge := range edges {
		children[edge.ParentMapID] = append(children[edge.ParentMapID], edge.ChildMapID)
	}
	seen := map[string]bool{}
	queue := []string{childID}
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		if id == parentID {
			return true
		}
		if !seen[id] {
			seen[id] = true
			queue = append(queue, children[id]...)
		}
	}
	return false
}

func lockPointcrawlMaps(ctx context.Context, repo MapWriteRepository, mapIDs ...string) (map[string]UpsertPointcrawlNodeState, error) {
	slices.Sort(mapIDs)
	states := make(map[string]UpsertPointcrawlNodeState, len(mapIDs))
	for _, id := range mapIDs {
		state, err := repo.LockUpsertPointcrawlNode(ctx, UpsertPointcrawlNodeSpec{MapId: id})
		if err != nil {
			return nil, err
		}
		if !state.Exists || state.MapKind != "pointcrawl" {
			return nil, apierr.New(apierr.NotFound, "pointcrawl map not found")
		}
		states[id] = state
	}
	return states, nil
}

func spatialWriteError(err error) error {
	if isNotFound(err) {
		return apierr.New(apierr.Invalid, "invalid pointcrawl reference")
	}
	if pg, ok := errors.AsType[*pgconn.PgError](err); ok {
		switch pg.Code {
		case "23505":
			return apierr.New(apierr.Conflict, "pointcrawl link already exists")
		case "23503", "23514":
			return apierr.New(apierr.Invalid, "invalid pointcrawl reference")
		}
	}
	return err
}

func (s ProductQueries) setMapCapability(ctx context.Context, actor auth.Authority, view *MapView) error {
	request, err := auth.ForMap("Mutation.upsertPointcrawlNode", auth.MapFacts{ID: &view.Id, RegionID: view.RegionId})
	if err != nil {
		return err
	}
	decision, err := s.Policy.Decide(ctx, actor, request)
	view.CanEdit = err == nil && decision.Allowed
	return err
}

func (s ProductQueries) setRegionCapability(ctx context.Context, actor auth.Authority, view *RegionView) error {
	request, err := auth.ForMap("Mutation.createMap", auth.MapFacts{RegionID: &view.Id})
	if err != nil {
		return err
	}
	decision, err := s.Policy.Decide(ctx, actor, request)
	view.CanCreateMap = err == nil && decision.Allowed
	return err
}
