package graphql

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
)

func graphQLRequest(t *testing.T, handler http.Handler, query, operation string, variables map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "operationName": operation, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	return w
}

func TestDepthLimitExpandsFragmentsAndUsesSelectedOperation(t *testing.T) {
	for _, tc := range []struct {
		name, query, operation string
		variables              map[string]any
		wantDepthError         bool
	}{
		{"named fragment and aliases", `query Deep { alias: questArc(id:"11111111-1111-4111-8111-111111111111") { ...Arc } } fragment Arc on QuestArcType { alias: quests { alias: arc { alias: quests { id } } } }`, "Deep", nil, true},
		{"inline fragment", `query Deep { questArc(id:"11111111-1111-4111-8111-111111111111") { ... on QuestArcType { quests { arc { quests { id } } } } } }`, "Deep", nil, true},
		{"selected operation", `query Deep {questArc(id:"11111111-1111-4111-8111-111111111111"){quests{arc{quests{id}}}}} query Shallow {_contractLayoutStub}`, "Shallow", nil, false},
		{"skipped subtree", `query Shallow($skip: Boolean!){ _contractLayoutStub questArc(id:"11111111-1111-4111-8111-111111111111") @skip(if:$skip) {quests{arc{quests{id}}}}}`, "Shallow", map[string]any{"skip": true}, false},
		{"included subtree", `query Deep($include: Boolean!){ _contractLayoutStub questArc(id:"11111111-1111-4111-8111-111111111111") @include(if:$include) {quests{arc{quests{id}}}}}`, "Deep", map[string]any{"include": true}, true},
		{"aliases are siblings", `query Shallow {a:_contractLayoutStub b:_contractLayoutStub c:_contractLayoutStub}`, "Shallow", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(&graph.Resolver{}, Limits{MaxDepth: 4}, nil)
			w := graphQLRequest(t, handler, tc.query, tc.operation, tc.variables)
			if tc.wantDepthError {
				if w.Code != http.StatusOK || !bytes.Contains(w.Body.Bytes(), []byte(`"code":"DEPTH_LIMIT_EXCEEDED"`)) {
					t.Fatalf("status=%d body=%s", w.Code, w.Body)
				}
			} else if w.Code != http.StatusOK || bytes.Contains(w.Body.Bytes(), []byte(`"errors"`)) {
				t.Fatalf("status=%d body=%s", w.Code, w.Body)
			}
		})
	}
}

func TestAliasLimitCountsRootAliasesAndFragments(t *testing.T) {
	aliases := func(n int) string {
		parts := make([]string, n)
		for i := range parts {
			parts[i] = fmt.Sprintf("a%d:_contractLayoutStub", i)
		}
		return strings.Join(parts, " ")
	}
	for _, tc := range []struct {
		name, query string
		wantError   bool
	}{
		{"21 aliased roots rejected", "query Q{" + aliases(21) + "}", true},
		{"20 aliased roots pass", "query Q{" + aliases(20) + "}", false},
		{"fragment spread aliases count", `query Q{...F} fragment F on Query{` + aliases(21) + `}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(&graph.Resolver{}, Limits{MaxAliases: 20}, nil)
			w := graphQLRequest(t, handler, tc.query, "Q", nil)
			if tc.wantError {
				if w.Code != http.StatusOK || !bytes.Contains(w.Body.Bytes(), []byte(`"code":"ALIAS_LIMIT_EXCEEDED"`)) {
					t.Fatalf("status=%d body=%s", w.Code, w.Body)
				}
			} else if w.Code != http.StatusOK || bytes.Contains(w.Body.Bytes(), []byte(`"errors"`)) {
				t.Fatalf("status=%d body=%s", w.Code, w.Body)
			}
		})
	}
}
