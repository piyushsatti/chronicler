package graphql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type documentErrorRepo struct {
	err  error
	view *document.DocumentView
}

func (r documentErrorRepo) ReadCodexCategories(context.Context, auth.Authority, document.CodexCategoriesSpec) ([]document.CategoryCountView, error) {
	return nil, r.err
}
func (r documentErrorRepo) ReadCodexDirectory(context.Context, auth.Authority, document.CodexDirectorySpec) (document.CodexDirectoryResult, error) {
	return document.CodexDirectoryResult{}, r.err
}
func (r documentErrorRepo) ReadCodexEntry(context.Context, auth.Authority, document.CodexEntrySpec) (*document.CodexEntryCardView, error) {
	return nil, r.err
}
func (r documentErrorRepo) ReadDocument(context.Context, auth.Authority, document.DocumentSpec) (*document.DocumentView, error) {
	return r.view, r.err
}
func (r documentErrorRepo) ReadDocumentBacklinks(context.Context, auth.Authority, document.DocumentBacklinksSpec) ([]document.DocumentLinkView, error) {
	return nil, r.err
}
func (r documentErrorRepo) ReadDocumentById(context.Context, auth.Authority, document.DocumentByIdSpec) (*document.DocumentView, error) {
	return r.view, r.err
}
func (r documentErrorRepo) ReadDocumentRevisionParent(context.Context, auth.Authority, string) (*document.DocumentView, error) {
	return r.view, r.err
}
func (r documentErrorRepo) ReadDocumentRevisions(context.Context, auth.Authority, document.DocumentRevisionsSpec) (document.DocumentRevisionPage, error) {
	return document.DocumentRevisionPage{}, r.err
}
func (r documentErrorRepo) ReadDocuments(context.Context, auth.Authority, document.DocumentsSpec) (document.DocumentListResult, error) {
	return document.DocumentListResult{}, r.err
}
func (r documentErrorRepo) ReadDocumentsTrash(context.Context, auth.Authority, document.DocumentsTrashSpec) (document.DocumentListResult, error) {
	return document.DocumentListResult{}, r.err
}
func (r documentErrorRepo) ReadLieutenantAssignments(context.Context, auth.Authority, document.LieutenantAssignmentsSpec) (document.LieutenantPage, error) {
	return document.LieutenantPage{}, r.err
}
func (r documentErrorRepo) ReadPreviewBody(context.Context, auth.Authority, document.PreviewBodySpec) (string, error) {
	return "", r.err
}

type documentErrorBatch struct{}

func (documentErrorBatch) ReadBatchDocuments(context.Context, auth.Authority, []document.DocumentKey) ([]product.BatchResult[document.DocumentView], error) {
	return nil, nil
}
func (documentErrorBatch) ReadBatchDmTables(context.Context, auth.Authority, []document.IDKey) ([]product.BatchResult[document.DocumentView], error) {
	return nil, nil
}
func (documentErrorBatch) ReadBatchSummaryDerived(context.Context, auth.Authority, []document.IDKey) ([]product.BatchResult[document.SummaryDerivedView], error) {
	return nil, nil
}
func (documentErrorBatch) ReadBatchDocumentSubjects(context.Context, auth.Authority, []document.DocumentSubjectsKey) ([]product.BatchResult[document.SubjectLinkList], error) {
	return nil, nil
}
func (documentErrorBatch) ReadBatchReaderIds(context.Context, auth.Authority, []document.IDKey) ([]product.BatchResult[document.ReaderIDList], error) {
	return nil, nil
}

type documentErrorAudience struct{}

func (documentErrorAudience) Assess(_ context.Context, _ auth.AudienceContext, refs []auth.DocumentRef) (auth.AudienceAssessment, error) {
	out := make([]auth.AudienceResult, len(refs))
	for i, ref := range refs {
		out[i] = auth.AudienceResult{SubjectID: ref.ID, Outcome: auth.AudienceOrdinary}
	}
	return auth.AudienceAssessment{Results: out}, nil
}
func (documentErrorAudience) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}
func (documentErrorAudience) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}
func (documentErrorAudience) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}
func (documentErrorAudience) HasArchon(context.Context, string, string) (bool, error) {
	return false, nil
}

func testDocumentQueries(t *testing.T, repo documentErrorRepo) *document.ProductQueries {
	t.Helper()
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments:          documentErrorAudience{},
		Audience:             documentErrorAudience{},
		Identities:           documentErrorAudience{},
		SummaryRelationships: documentErrorAudience{},
	})
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	queries, err := document.NewProductQueries(
		document.ProductReadRepos{Document: repo, Batch: documentErrorBatch{}},
		policy,
		func() time.Time { return time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC) },
		observer,
	)
	if err != nil {
		t.Fatal(err)
	}
	return queries
}

func TestDocumentGraphQLErrorPresenter(t *testing.T) {
	body := "ordinary-public-body"
	secretBody := "secret-body"
	for _, tc := range []struct {
		name    string
		repo    documentErrorRepo
		code    string
		allowed bool
	}{
		{"existing denied", documentErrorRepo{err: document.ErrForbidden}, "FORBIDDEN", false},
		{"actually missing", documentErrorRepo{err: document.ErrNotFound}, "NOT_FOUND", false},
		{"unexpected failure opaque", documentErrorRepo{err: errors.New("database password private-internal-error")}, "INTERNAL", false},
		{"ordinary public usable", documentErrorRepo{view: &document.DocumentView{
			Id:            "11111111-1111-4111-8111-111111111111",
			Status:        string(document.StatusPublished),
			Visibility:    string(document.VisibilityPublic),
			EffectiveBody: &body,
		}}, "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(&graph.Resolver{Services: graph.Services{DocumentQueries: testDocumentQueries(t, tc.repo)}}, Limits{}, func(context.Context, string) (auth.Authority, error) {
				return auth.Authority{}, nil
			})
			request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewBufferString(`{"query":"{documentById(id:\"11111111-1111-4111-8111-111111111111\"){id effectiveBody}}"}`))
			request.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, request)
			var result struct {
				Data struct {
					Doc *struct {
						ID   string `json:"id"`
						Body string `json:"effectiveBody"`
					} `json:"documentById"`
				} `json:"data"`
				Errors []struct {
					Extensions struct {
						Code string `json:"code"`
					} `json:"extensions"`
				} `json:"errors"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
				t.Fatalf("status=%d body=%s err=%v", w.Code, w.Body, err)
			}
			if tc.allowed {
				if len(result.Errors) != 0 || result.Data.Doc == nil || result.Data.Doc.Body != body {
					t.Fatalf("public response=%s", w.Body)
				}
			} else {
				if result.Data.Doc != nil || len(result.Errors) != 1 || result.Errors[0].Extensions.Code != tc.code {
					t.Fatalf("denial response=%s want=%s", w.Body, tc.code)
				}
				for _, secret := range []string{"22222222-2222-4222-8222-222222222222", secretBody, "private-internal-error", "password"} {
					if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
						t.Fatalf("error leaked %q: %s", secret, w.Body)
					}
				}
			}
		})
	}
}
