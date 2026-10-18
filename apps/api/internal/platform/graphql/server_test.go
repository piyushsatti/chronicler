package graphql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
)

type documentErrorRepo struct {
	err error
	doc document.Document
}

func (r documentErrorRepo) RevisionAuthor(context.Context, string) (string, error) {
	return r.doc.AuthorID, r.err
}

func (r documentErrorRepo) ByID(context.Context, string) (document.Document, error) {
	return r.doc, r.err
}
func (r documentErrorRepo) BySlug(context.Context, string) (document.Document, error) {
	return r.doc, r.err
}
func (r documentErrorRepo) List(context.Context, document.ViewerScope, document.ListFilter) ([]document.Document, int64, error) {
	return nil, 0, r.err
}
func (r documentErrorRepo) ReaderIDs(context.Context, string) (map[string]struct{}, error) {
	return nil, r.err
}

func TestDocumentGraphQLErrorPresenter(t *testing.T) {
	for _, tc := range []struct {
		name    string
		repo    documentErrorRepo
		code    string
		allowed bool
	}{
		{"existing denied", documentErrorRepo{doc: document.Document{ID: "22222222-2222-4222-8222-222222222222", Status: document.StatusPublished, Visibility: document.VisibilityPublic, Policy: json.RawMessage(`[]`), Body: "secret-body"}}, "FORBIDDEN", false},
		{"actually missing", documentErrorRepo{err: document.ErrNotFound}, "NOT_FOUND", false},
		{"unexpected failure opaque", documentErrorRepo{err: errors.New("database password private-internal-error")}, "INTERNAL", false},
		{"ordinary public usable", documentErrorRepo{doc: document.Document{ID: "11111111-1111-4111-8111-111111111111", Status: document.StatusPublished, Visibility: document.VisibilityPublic, Body: "ordinary-public-body"}}, "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(&graph.Resolver{Services: graph.Services{Documents: document.Queries{Repo: tc.repo}}}, Limits{}, nil)
			// ID scalar requires a UUID wire value (same as product GraphQL).
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
				if len(result.Errors) != 0 || result.Data.Doc == nil || result.Data.Doc.Body != "ordinary-public-body" {
					t.Fatalf("public response=%s", w.Body)
				}
			} else {
				if result.Data.Doc != nil || len(result.Errors) != 1 || result.Errors[0].Extensions.Code != tc.code {
					t.Fatalf("denial response=%s want=%s", w.Body, tc.code)
				}
				for _, secret := range []string{"22222222-2222-4222-8222-222222222222", "secret-body", "private-internal-error", "password"} {
					if bytes.Contains(w.Body.Bytes(), []byte(secret)) {
						t.Fatalf("error leaked %q: %s", secret, w.Body)
					}
				}
			}
		})
	}
}
