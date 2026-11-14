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
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
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

func testDocumentQueries(t *testing.T, repo document.DocumentReadRepository) *document.ProductQueries {
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

type panickingDocumentRepo struct{ documentErrorRepo }

func (panickingDocumentRepo) ReadDocumentById(context.Context, auth.Authority, document.DocumentByIdSpec) (*document.DocumentView, error) {
	panic("resolver boom")
}

func TestGraphQLOperationAndUnexpectedErrorShareRequestID(t *testing.T) {
	const wantID = "gql-request-id-9"
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(httpserver.ContextHandler(slog.NewJSONHandler(&logs, nil))))
	t.Cleanup(func() { slog.SetDefault(previous) })

	handler := httpserver.RequestID(httpserver.RequestLog(NewHandler(
		&graph.Resolver{Services: graph.Services{DocumentQueries: testDocumentQueries(t, documentErrorRepo{err: errors.New("database boom")})}},
		Limits{},
		func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil },
	)))
	body := `{"query":"query NamedDoc { documentById(id:\"11111111-1111-4111-8111-111111111111\") { id } }","operationName":"NamedDoc"}`
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", wantID)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	if w.Header().Get("X-Request-Id") != wantID {
		t.Fatalf("X-Request-Id=%q", w.Header().Get("X-Request-Id"))
	}
	opID, opName := graphqlLogFields(t, logs.Bytes(), "graphql operation")
	if opID != wantID || opName != "NamedDoc" {
		t.Fatalf("operation request_id=%q name=%q logs=%s", opID, opName, logs.String())
	}
	if got := graphqlLogRequestID(t, logs.Bytes(), "request"); got != wantID {
		t.Fatalf("request request_id=%q logs=%s", got, logs.String())
	}
	if got := graphqlLogRequestID(t, logs.Bytes(), "unexpected GraphQL error"); got != wantID {
		t.Fatalf("error request_id=%q logs=%s", got, logs.String())
	}
}

func graphqlLogRequestID(t *testing.T, raw []byte, msg string) string {
	t.Helper()
	id, _ := graphqlLogFields(t, raw, msg)
	return id
}

func graphqlLogFields(t *testing.T, raw []byte, msg string) (requestID, operation string) {
	t.Helper()
	for _, line := range bytes.Split(raw, []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var entry struct {
			Msg       string `json:"msg"`
			RequestID string `json:"request_id"`
			Operation string `json:"operation"`
		}
		if err := json.Unmarshal(line, &entry); err != nil {
			t.Fatalf("unmarshal %s: %v", line, err)
		}
		if entry.Msg == msg {
			return entry.RequestID, entry.Operation
		}
	}
	t.Fatalf("missing %q log in %s", msg, raw)
	return "", ""
}

func TestGraphQLRecoverFuncReturnsInternalWithStackLog(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	handler := NewHandler(&graph.Resolver{Services: graph.Services{DocumentQueries: testDocumentQueries(t, panickingDocumentRepo{})}}, Limits{}, func(context.Context, string) (auth.Authority, error) {
		return auth.Authority{}, nil
	})
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewBufferString(`{"query":"{documentById(id:\"11111111-1111-4111-8111-111111111111\"){id}}"}`))
	request.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	var result struct {
		Errors []struct {
			Extensions struct {
				Code string `json:"code"`
			} `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
		t.Fatalf("status=%d body=%s err=%v", w.Code, w.Body, err)
	}
	if len(result.Errors) != 1 || result.Errors[0].Extensions.Code != "INTERNAL" {
		t.Fatalf("response=%s", w.Body)
	}
	if !bytes.Contains(logs.Bytes(), []byte(`"stack"`)) || !bytes.Contains(logs.Bytes(), []byte("goroutine")) {
		t.Fatalf("missing stack log: %s", logs.String())
	}
}

func countingAuthority(t *testing.T, live auth.Authority) (auth.AuthorityResolver, *int) {
	t.Helper()
	calls := 0
	return func(context.Context, string) (auth.Authority, error) {
		calls++
		return live, nil
	}, &calls
}

func signedInGraphQL(handler http.Handler, query string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewBufferString(`{"query":`+mustJSON(query)+`}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(auth.WithClaims(request.Context(), auth.Claims{MemberID: "ada"}))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	return w
}

func TestSignedInLimitsAndValidationCallAuthorityResolverZeroTimes(t *testing.T) {
	live, err := auth.NewAuthority("ada", []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	selection := "id"
	for range 40 {
		selection = "quests(limit:1){arc{" + selection + "}}"
	}
	for _, tc := range []struct {
		name, query, code string
	}{
		{"depth", `{questArc(id:"11111111-1111-4111-8111-111111111111"){` + selection + `}}`, "DEPTH_LIMIT_EXCEEDED"},
		{"complexity", `{questArc(id:"11111111-1111-4111-8111-111111111111"){quests(limit:50){arc{quests(limit:50){arc{quests(limit:50){id}}}}}}}`, "COMPLEXITY_LIMIT_EXCEEDED"},
		{"schema", `{notARealField}`, "GRAPHQL_VALIDATION_FAILED"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resolve, calls := countingAuthority(t, live)
			handler := NewHandler(&graph.Resolver{}, DefaultLimits(), resolve)
			w := signedInGraphQL(handler, tc.query)
			if !bytes.Contains(w.Body.Bytes(), []byte(`"code":"`+tc.code+`"`)) || *calls != 0 {
				t.Fatalf("status=%d calls=%d body=%s", w.Code, *calls, w.Body)
			}
		})
	}
}

type capturingDocumentRepo struct {
	documentErrorRepo
	actor auth.Authority
}

func (r *capturingDocumentRepo) ReadDocumentById(ctx context.Context, actor auth.Authority, spec document.DocumentByIdSpec) (*document.DocumentView, error) {
	r.actor = actor
	return r.documentErrorRepo.ReadDocumentById(ctx, actor, spec)
}

func TestSignedInValidQueryResolvesAuthorityOnce(t *testing.T) {
	live, err := auth.NewAuthority("ada", []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	body := "ordinary-public-body"
	repo := &capturingDocumentRepo{documentErrorRepo: documentErrorRepo{view: &document.DocumentView{
		Id:            "11111111-1111-4111-8111-111111111111",
		Status:        string(document.StatusPublished),
		Visibility:    string(document.VisibilityPublic),
		EffectiveBody: &body,
	}}}
	resolve, calls := countingAuthority(t, live)
	handler := NewHandler(&graph.Resolver{Services: graph.Services{DocumentQueries: testDocumentQueries(t, repo)}}, DefaultLimits(), resolve)
	w := signedInGraphQL(handler, `{documentById(id:"11111111-1111-4111-8111-111111111111"){id effectiveBody}}`)
	if w.Code != http.StatusOK || *calls != 1 || !bytes.Contains(w.Body.Bytes(), []byte(body)) {
		t.Fatalf("status=%d calls=%d body=%s", w.Code, *calls, w.Body)
	}
	if repo.actor.Claims().MemberID != "ada" {
		t.Fatalf("LiveAuthority actor=%+v", repo.actor.Claims())
	}
}

func assertOneGraphQLCode(t *testing.T, w *httptest.ResponseRecorder, code string) {
	t.Helper()
	var result struct {
		Errors []struct {
			Extensions struct {
				Code string `json:"code"`
			} `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != http.StatusOK || len(result.Errors) != 1 || result.Errors[0].Extensions.Code != code {
		t.Fatalf("status=%d body=%s err=%v want=%s", w.Code, w.Body, err, code)
	}
}

func TestLiveAuthorityInterceptorFailures(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	other, err := auth.NewAuthority("ben", []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		resolve auth.AuthorityResolver
		code  string
		log   string
	}{
		{"anonymous authority", func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, nil }, "FORBIDDEN", ""},
		{"mismatched member", func(context.Context, string) (auth.Authority, error) { return other, nil }, "FORBIDDEN", ""},
		{"plain error", func(context.Context, string) (auth.Authority, error) { return auth.Authority{}, errors.New("database boom") }, "INTERNAL", "database boom"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			logs.Reset()
			handler := NewHandler(&graph.Resolver{}, DefaultLimits(), tc.resolve)
			w := signedInGraphQL(handler, `{_contractLayoutStub}`)
			assertOneGraphQLCode(t, w, tc.code)
			if tc.log != "" && !bytes.Contains(logs.Bytes(), []byte(tc.log)) {
				t.Fatalf("missing cause log: %s", logs.String())
			}
		})
	}
}

func TestAnonymousGraphQLSkipsAuthorityResolver(t *testing.T) {
	calls := 0
	handler := NewHandler(&graph.Resolver{}, DefaultLimits(), func(context.Context, string) (auth.Authority, error) {
		calls++
		return auth.Authority{}, nil
	})
	w := graphQLRequest(t, handler, `{_contractLayoutStub}`, "", nil)
	if w.Code != http.StatusOK || calls != 0 || !bytes.Contains(w.Body.Bytes(), []byte(`"_contractLayoutStub":false`)) {
		t.Fatalf("status=%d calls=%d body=%s", w.Code, calls, w.Body)
	}
}

func mustJSON(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func TestGraphQLErrorPresenterLogsWrappedInternalNotBareNotFound(t *testing.T) {
	cause := errors.New("database blip")
	for _, tc := range []struct {
		name string
		err  error
		code string
		log  bool
	}{
		{"wrapped internal", apierr.Wrap(apierr.Internal, "Internal error", cause), "INTERNAL", true},
		{"bare not found", apierr.New(apierr.NotFound, "document not found"), "NOT_FOUND", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var logs bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
			t.Cleanup(func() { slog.SetDefault(previous) })

			handler := NewHandler(&graph.Resolver{Services: graph.Services{DocumentQueries: testDocumentQueries(t, documentErrorRepo{err: tc.err})}}, Limits{}, func(context.Context, string) (auth.Authority, error) {
				return auth.Authority{}, nil
			})
			request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewBufferString(`{"query":"{documentById(id:\"11111111-1111-4111-8111-111111111111\"){id}}"}`))
			request.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, request)
			var result struct {
				Errors []struct {
					Message    string `json:"message"`
					Extensions struct {
						Code string `json:"code"`
					} `json:"extensions"`
				} `json:"errors"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
				t.Fatalf("status=%d body=%s err=%v", w.Code, w.Body, err)
			}
			if len(result.Errors) != 1 || result.Errors[0].Extensions.Code != tc.code {
				t.Fatalf("response=%s want code=%s", w.Body, tc.code)
			}
			if tc.log {
				if result.Errors[0].Message != "Internal error" {
					t.Fatalf("client message=%q", result.Errors[0].Message)
				}
				if !bytes.Contains(logs.Bytes(), []byte("database blip")) {
					t.Fatalf("missing cause log: %s", logs.String())
				}
				if bytes.Contains(w.Body.Bytes(), []byte("database blip")) {
					t.Fatalf("cause leaked to client: %s", w.Body)
				}
			} else if logs.Len() != 0 {
				t.Fatalf("unexpected log for bare not found: %s", logs.String())
			}
		})
	}
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

type countingArcRepo struct {
	quest.ArcReadRepository
	calls int
}

func (r *countingArcRepo) ReadQuestArc(context.Context, auth.Authority, quest.QuestArcSpec) (*quest.QuestArcView, error) {
	r.calls++
	return nil, nil
}

func assertArcQueryRejectedBeforeProviders(t *testing.T, query, code string) {
	t.Helper()
	repo := &countingArcRepo{}
	queries := &quest.ProductQueries{
		Reads:  quest.ProductReadRepos{Arc: repo},
		Policy: testDocumentQueries(t, documentErrorRepo{}).Policy,
		Clock:  func() time.Time { return time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC) },
	}
	handler := NewHandler(&graph.Resolver{Services: graph.Services{QuestQueries: queries}}, DefaultLimits(), func(context.Context, string) (auth.Authority, error) {
		return auth.Authority{}, nil
	})
	control := graphQLRequest(t, handler, `{questArc(id:"11111111-1111-4111-8111-111111111111"){id}}`, "", nil)
	if control.Code != http.StatusOK || repo.calls != 1 || bytes.Contains(control.Body.Bytes(), []byte(`"errors"`)) {
		t.Fatalf("control status=%d calls=%d body=%s", control.Code, repo.calls, control.Body)
	}
	repo.calls = 0
	w := graphQLRequest(t, handler, query, "", nil)
	if w.Code != http.StatusOK || !bytes.Contains(w.Body.Bytes(), []byte(`"code":"`+code+`"`)) || repo.calls != 0 {
		t.Fatalf("status=%d provider calls=%d body=%s", w.Code, repo.calls, w.Body)
	}
}

func TestDefaultLimitsRejectDeepArcQuestCycleBeforeResolvers(t *testing.T) {
	selection := "id"
	for range 40 {
		selection = "quests(limit:1){arc{" + selection + "}}"
	}
	assertArcQueryRejectedBeforeProviders(t, `{questArc(id:"11111111-1111-4111-8111-111111111111"){`+selection+`}}`, "DEPTH_LIMIT_EXCEEDED")
}

func TestDefaultLimitsRejectWideNestedArcLists(t *testing.T) {
	query := `{questArc(id:"11111111-1111-4111-8111-111111111111"){quests(limit:50){arc{quests(limit:50){arc{quests(limit:50){id}}}}}}}`
	assertArcQueryRejectedBeforeProviders(t, query, "COMPLEXITY_LIMIT_EXCEEDED")
}
