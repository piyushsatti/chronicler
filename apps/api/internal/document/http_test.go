package document_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestRevisionsRequiresStore(t *testing.T) {
	mux := http.NewServeMux()
	document.HTTP{Q: document.Queries{}}.Routes(mux)
	req := httptest.NewRequest(http.MethodGet, "/v1/documents/abc/revisions", nil)
	req.SetPathValue("id", "abc")
	req = req.WithContext(auth.WithClaims(req.Context(), auth.Claims{MemberID: "m1", Roles: []auth.Role{auth.Player}}))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d", rec.Code)
	}
}
