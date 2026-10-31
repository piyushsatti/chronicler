package document

import (
	"context"
	"encoding/json"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

var errDiscoveryTotalMismatch = errors.New("document search discovery totals differ across page rows")

func (p *ProductPostgres) RecentDiscovery(ctx context.Context, actor auth.Authority) ([]DiscoveryBucket, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	rows, err := p.queries().DocumentRecentDiscovery(ctx, dbgen.DocumentRecentDiscoveryParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return nil, err
	}
	buckets, err := mapRecentDiscovery(ctx, scope, rows)
	if err != nil {
		return nil, err
	}
	views := []*DocumentView{}
	for i := range buckets {
		views = append(views, documentViewPointers(buckets[i].Documents)...)
	}
	if err := p.setDocumentCapabilities(ctx, actor, views); err != nil {
		return nil, err
	}
	return buckets, nil
}

func (p *ProductPostgres) CountDiscovery(ctx context.Context, actor auth.Authority) (DiscoveryCounts, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return DiscoveryCounts{}, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	params := dbgen.DocumentDiscoveryCountsByKindParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	}
	byKindRows, err := p.queries().DocumentDiscoveryCountsByKind(ctx, params)
	if err != nil {
		return DiscoveryCounts{}, err
	}
	byCategoryRows, err := p.queries().DocumentDiscoveryCountsByCategory(ctx, dbgen.DocumentDiscoveryCountsByCategoryParams{
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return DiscoveryCounts{}, err
	}
	out := DiscoveryCounts{
		ByKind:     make([]DiscoveryCount, 0, len(byKindRows)),
		ByCategory: make([]DiscoveryCount, 0, len(byCategoryRows)),
	}
	for _, row := range byKindRows {
		out.ByKind = append(out.ByKind, DiscoveryCount{Key: row.Key, Count: row.Count})
	}
	for _, row := range byCategoryRows {
		key := ""
		if row.Key.Valid {
			key = row.Key.String
		}
		out.ByCategory = append(out.ByCategory, DiscoveryCount{Key: key, Count: row.Count})
	}
	return out, nil
}

type discoverySearchProjection struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (p *ProductPostgres) SearchDiscovery(ctx context.Context, actor auth.Authority, query string, kinds []string, page product.Page) (DiscoveryPage, error) {
	if page.Limit <= 0 || page.Offset < 0 {
		return DiscoveryPage{}, apierr.New(apierr.Invalid, "invalid search page")
	}
	docKinds, err := documentDiscoveryKinds(kinds)
	if err != nil {
		return DiscoveryPage{}, err
	}
	if len(docKinds) == 0 {
		return DiscoveryPage{Items: []DocumentSearchHitView{}, Order: discoverySearchOrder}, nil
	}
	scope := ScopeFromAuthority(actor)
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	candidates, err := p.queries().DocumentSearchCandidates(ctx, dbgen.DocumentSearchCandidatesParams{
		Kinds:    docKinds,
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
	})
	if err != nil {
		return DiscoveryPage{}, err
	}
	// Reader grants and candidate visibility come from the same SQL snapshot.
	scope.ReaderOf = make(map[string]struct{})
	for _, row := range candidates {
		if row.ReaderGranted {
			scope.ReaderOf[db.UUIDString(row.ID)] = struct{}{}
		}
	}
	projected := make([]discoverySearchProjection, 0, len(candidates))
	hits := make(map[string]DocumentSearchHitView, len(candidates))
	for _, row := range candidates {
		view, err := documentFromParts(
			row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body,
			row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt,
			row.DeletedAt, pgtype.UUID{}, row.UpdatedAt, row.Version,
		)
		if err != nil {
			return DiscoveryPage{}, err
		}
		view, err = ProjectDocumentView(ctx, scope, view, row.Body)
		if err != nil {
			return DiscoveryPage{}, err
		}
		body := *view.EffectiveBody
		projected = append(projected, discoverySearchProjection{ID: view.Id, Title: view.Title, Body: body, UpdatedAt: view.UpdatedAt})
		var questShortCode *string
		if view.Kind == "quest_brief" && row.QuestShortCode != "" {
			questShortCode = &row.QuestShortCode
		}
		hits[view.Id] = DocumentSearchHitView{
			Id: view.Id, Kind: view.Kind, Slug: view.Slug, Title: view.Title, Category: view.Category,
			Snippet: truncateCodepoints(body, discoverySnippetMaxCodepoints), QuestShortCode: questShortCode,
		}
	}
	encoded, err := json.Marshal(projected)
	if err != nil {
		return DiscoveryPage{}, err
	}
	rows, err := p.queries().DocumentSearchDiscovery(ctx, dbgen.DocumentSearchDiscoveryParams{
		Query: query, ProjectedDocuments: encoded, PageLimit: page.Limit, PageOffset: page.Offset,
	})
	if err != nil {
		return DiscoveryPage{}, err
	}
	return mapSearchDiscovery(rows, hits)
}

func documentDiscoveryKinds(kinds []string) ([]string, error) {
	allowed := []string{"codex_entry", "rule", "summary", "quest_brief", "community"}
	if kinds == nil {
		return allowed, nil
	}
	out := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		switch kind {
		case "codex_entry", "rule", "summary", "quest_brief", "community":
			out = append(out, kind)
		case "member":
		default:
			return nil, apierr.New(apierr.Invalid, "unknown search kind")
		}
	}
	return out, nil
}

func mapRecentDiscovery(ctx context.Context, scope ViewerScope, rows []dbgen.DocumentRecentDiscoveryRow) ([]DiscoveryBucket, error) {
	if len(rows) == 0 {
		return []DiscoveryBucket{}, nil
	}
	buckets := make([]DiscoveryBucket, 0)
	var current *DiscoveryBucket
	var currentKey *string
	sameCategory := func(a, b *string) bool {
		if a == nil && b == nil {
			return true
		}
		if a == nil || b == nil {
			return false
		}
		return *a == *b
	}
	for _, row := range rows {
		view, err := documentFromParts(
			row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body,
			row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt,
			row.DeletedAt, pgtype.UUID{}, row.UpdatedAt, row.Version,
		)
		if err != nil {
			return nil, err
		}
		if adminOverride, _ := row.AdminOverride.(bool); adminOverride {
			AuditSQLOverride(ctx, scope, true, "discovery", "recent")
		}
		view, err = ProjectDocumentView(ctx, scope, view, row.Body)
		if err != nil {
			return nil, err
		}
		category := productTextPointer(row.Category)
		if current == nil || !sameCategory(currentKey, category) {
			buckets = append(buckets, DiscoveryBucket{Category: category, Documents: make([]DocumentView, 0, recentDiscoveryDocsPerBucket)})
			current = &buckets[len(buckets)-1]
			currentKey = category
		}
		current.Documents = append(current.Documents, view)
	}
	if len(buckets) > recentDiscoveryBucketLimit {
		buckets = buckets[:recentDiscoveryBucketLimit]
	}
	return buckets, nil
}

func mapSearchDiscovery(rows []dbgen.DocumentSearchDiscoveryRow, hits map[string]DocumentSearchHitView) (DiscoveryPage, error) {
	if len(rows) == 0 {
		return DiscoveryPage{}, errors.New("document search discovery returned no total row")
	}
	page := DiscoveryPage{Total: rows[0].Total, Order: discoverySearchOrder, Items: make([]DocumentSearchHitView, 0, len(rows))}
	for _, row := range rows {
		if row.Total != page.Total {
			return DiscoveryPage{}, errDiscoveryTotalMismatch
		}
		if !row.ID.Valid {
			continue
		}
		hit, ok := hits[db.UUIDString(row.ID)]
		if !ok {
			return DiscoveryPage{}, errors.New("document search discovery returned an unknown projection")
		}
		page.Items = append(page.Items, hit)
	}
	return page, nil
}

func truncateCodepoints(s string, max int) string {
	if max <= 0 || s == "" {
		return ""
	}
	count := 0
	for i := 0; i < len(s); {
		_, size := utf8.DecodeRuneInString(s[i:])
		count++
		if count > max {
			return s[:i]
		}
		i += size
	}
	return s
}
