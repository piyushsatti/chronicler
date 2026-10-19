package graph

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type searchDocumentsRepo struct {
	last document.DocumentsSpec
	out  document.DocumentListResult
	err  error
}

func (r *searchDocumentsRepo) ReadCodexCategories(context.Context, auth.Authority, document.CodexCategoriesSpec) ([]document.CategoryCountView, error) {
	return nil, nil
}
func (r *searchDocumentsRepo) ReadCodexDirectory(context.Context, auth.Authority, document.CodexDirectorySpec) (document.CodexDirectoryResult, error) {
	return document.CodexDirectoryResult{}, nil
}
func (r *searchDocumentsRepo) ReadCodexEntry(context.Context, auth.Authority, document.CodexEntrySpec) (*document.CodexEntryCardView, error) {
	return nil, nil
}
func (r *searchDocumentsRepo) ReadDocument(context.Context, auth.Authority, document.DocumentSpec) (*document.DocumentView, error) {
	return nil, nil
}
func (r *searchDocumentsRepo) ReadDocumentBacklinks(context.Context, auth.Authority, document.DocumentBacklinksSpec) ([]document.DocumentLinkView, error) {
	return nil, nil
}
func (r *searchDocumentsRepo) ReadDocumentById(context.Context, auth.Authority, document.DocumentByIdSpec) (*document.DocumentView, error) {
	return nil, nil
}
func (r *searchDocumentsRepo) ReadDocumentRevisions(context.Context, auth.Authority, document.DocumentRevisionsSpec) (document.DocumentRevisionPage, error) {
	return document.DocumentRevisionPage{}, nil
}
func (r *searchDocumentsRepo) ReadDocuments(_ context.Context, _ auth.Authority, spec document.DocumentsSpec) (document.DocumentListResult, error) {
	r.last = spec
	return r.out, r.err
}
func (r *searchDocumentsRepo) ReadDocumentsTrash(context.Context, auth.Authority, document.DocumentsTrashSpec) (document.DocumentListResult, error) {
	return document.DocumentListResult{}, nil
}
func (r *searchDocumentsRepo) ReadLieutenantAssignments(context.Context, auth.Authority, document.LieutenantAssignmentsSpec) (document.LieutenantPage, error) {
	return document.LieutenantPage{}, nil
}
func (r *searchDocumentsRepo) ReadPreviewBody(context.Context, auth.Authority, document.PreviewBodySpec) (string, error) {
	return "", nil
}

type searchDocumentsBatch struct{}

func (searchDocumentsBatch) ReadBatchDocuments(context.Context, auth.Authority, []document.DocumentKey) ([]product.BatchResult[document.DocumentView], error) {
	return nil, nil
}
func (searchDocumentsBatch) ReadBatchDmTables(context.Context, auth.Authority, []document.IDKey) ([]product.BatchResult[document.DocumentView], error) {
	return nil, nil
}
func (searchDocumentsBatch) ReadBatchSummaryDerived(context.Context, auth.Authority, []document.IDKey) ([]product.BatchResult[document.SummaryDerivedView], error) {
	return nil, nil
}
func (searchDocumentsBatch) ReadBatchDocumentSubjects(context.Context, auth.Authority, []document.DocumentSubjectsKey) ([]product.BatchResult[document.SubjectLinkList], error) {
	return nil, nil
}

type searchAudience struct{}

func (searchAudience) Assess(_ context.Context, _ auth.AudienceContext, refs []auth.DocumentRef) (auth.AudienceAssessment, error) {
	out := make([]auth.AudienceResult, len(refs))
	for i, ref := range refs {
		out[i] = auth.AudienceResult{SubjectID: ref.ID, Outcome: auth.AudienceOrdinary}
	}
	return auth.AudienceAssessment{Results: out}, nil
}
func (searchAudience) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}
func (searchAudience) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}
func (searchAudience) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}
func (searchAudience) HasArchon(context.Context, string, string) (bool, error) {
	return false, nil
}

func testSearchDocumentQueries(t *testing.T, repo *searchDocumentsRepo) *document.ProductQueries {
	t.Helper()
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments:          searchAudience{},
		Audience:             searchAudience{},
		Identities:           searchAudience{},
		SummaryRelationships: searchAudience{},
	})
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	queries, err := document.NewProductQueries(
		document.ProductReadRepos{Document: repo, Batch: searchDocumentsBatch{}},
		policy,
		func() time.Time { return time.Date(2026, 10, 18, 20, 0, 0, 0, time.UTC) },
		observer,
	)
	if err != nil {
		t.Fatal(err)
	}
	return queries
}

func TestSearchUsesProductDocuments(t *testing.T) {
	cat := "lore"
	repo := &searchDocumentsRepo{out: document.DocumentListResult{
		Total: 1,
		Items: []document.DocumentView{{
			Id: "11111111-1111-4111-8111-111111111111", Kind: "codex_entry", Category: &cat,
			Slug: "alpha", Title: "Alpha Codex",
		}},
	}}
	r := &Resolver{Services: Services{DocumentQueries: testSearchDocumentQueries(t, repo)}}
	actor, err := auth.NewAuthority("reader", []auth.Role{auth.Player}, "active", "approved")
	if err != nil {
		t.Fatal(err)
	}
	ctx := auth.WithAuthority(context.Background(), actor)

	got, err := r.Query().Search(ctx, "Alpha", nil, 20, 0)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if repo.last.Filters == nil || repo.last.Filters.Search == nil || *repo.last.Filters.Search != "Alpha" {
		t.Fatalf("DocumentsSpec filters = %+v", repo.last.Filters)
	}
	if repo.last.Limit != 20 || repo.last.Offset != 0 {
		t.Fatalf("page = limit %d offset %d", repo.last.Limit, repo.last.Offset)
	}
	if got.Query != "Alpha" || got.DocumentTotal != 1 || got.DocumentOrder != documentListOrder {
		t.Fatalf("result meta = %+v", got)
	}
	if len(got.Documents) != 1 || got.Documents[0].Slug != "alpha" || got.Documents[0].Snippet != "Alpha Codex" {
		t.Fatalf("documents = %+v", got.Documents)
	}
	if got.Documents[0].Category == nil || *got.Documents[0].Category != "lore" {
		t.Fatalf("category = %v", got.Documents[0].Category)
	}
	if got.Members == nil || len(got.Members) != 0 || got.MemberTotal != 0 {
		t.Fatalf("members must stay empty under documents-only Search: %+v", got.Members)
	}
}
