package document

import (
	"context"
	"errors"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
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
	return mapRecentDiscovery(ctx, scope, rows)
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

func (p *ProductPostgres) SearchDiscovery(ctx context.Context, actor auth.Authority, query string, kinds []string, page product.Page) (DiscoveryPage, error) {
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return DiscoveryPage{}, err
	}
	viewerID, roles, handle, admin, liveDM := viewerParams(scope)
	docKinds := documentDiscoveryKinds(kinds)
	rows, err := p.queries().DocumentSearchDiscovery(ctx, dbgen.DocumentSearchDiscoveryParams{
		Query: query, Kinds: docKinds,
		ViewerID: viewerID, ViewerRoles: roles, ViewerHandle: handle, ViewerAdmin: admin, ViewerLiveDm: liveDM,
		PageLimit: page.Limit, PageOffset: page.Offset,
	})
	if err != nil {
		return DiscoveryPage{}, err
	}
	return mapSearchDiscovery(ctx, scope, rows)
}

func documentDiscoveryKinds(kinds []string) []string {
	if len(kinds) == 0 {
		return []string{}
	}
	allowed := map[string]struct{}{
		"codex_entry": {}, "rule": {}, "summary": {}, "quest_brief": {}, "community": {},
	}
	out := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		if _, ok := allowed[kind]; ok {
			out = append(out, kind)
		}
	}
	if len(out) == 0 {
		// Explicit kinds with no document vocabulary means an empty document page.
		return []string{"__none__"}
	}
	return out
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
		view, err = projectDocumentView(ctx, scope, view, row.Body)
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

func mapSearchDiscovery(ctx context.Context, scope ViewerScope, rows []dbgen.DocumentSearchDiscoveryRow) (DiscoveryPage, error) {
	if len(rows) == 0 {
		return DiscoveryPage{Items: []DocumentSearchHitView{}, Order: discoverySearchOrder}, nil
	}
	page := DiscoveryPage{Total: rows[0].Total, Order: discoverySearchOrder, Items: make([]DocumentSearchHitView, 0, len(rows))}
	for _, row := range rows {
		if row.Total != page.Total {
			return DiscoveryPage{}, errDiscoveryTotalMismatch
		}
		if !row.ID.Valid || !row.Kind.Valid || !row.Slug.Valid || !row.Title.Valid || !row.Status.Valid || !row.Visibility.Valid || !row.Body.Valid || !row.AuthorID.Valid || !row.UpdatedAt.Valid || !row.Version.Valid {
			continue
		}
		view, err := documentFromParts(
			row.ID, row.Kind.String, row.Slug.String, row.Title.String, row.Status.String, row.Visibility.String, row.Body.String,
			row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt,
			row.DeletedAt, pgtype.UUID{}, row.UpdatedAt, row.Version.Int32,
		)
		if err != nil {
			return DiscoveryPage{}, err
		}
		view, err = projectDocumentView(ctx, scope, view, row.Body.String)
		if err != nil {
			return DiscoveryPage{}, err
		}
		snippet := ""
		if view.EffectiveBody != nil {
			snippet = truncateCodepoints(*view.EffectiveBody, discoverySnippetMaxCodepoints)
		}
		page.Items = append(page.Items, DocumentSearchHitView{
			Id: view.Id, Kind: view.Kind, Slug: view.Slug, Title: view.Title,
			Category: view.Category, Snippet: snippet,
		})
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
