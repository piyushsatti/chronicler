package document

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// publishedLegacy is a published Document with no policy, so Specify compiles
// its legacy visibility.
func publishedLegacy(visibility Visibility, documentID, authorID string) Document {
	return Document{ID: documentID, AuthorID: authorID, Status: StatusPublished, Visibility: visibility}
}

func TestViewerScope(t *testing.T) {
	anon := ScopeFromClaims(auth.Claims{})
	if !Specify(publishedLegacy(VisibilityPublic, "doc", "")).Allows(anon) {
		t.Fatal("anon should read public")
	}
	if Specify(publishedLegacy(VisibilityDMOnly, "doc", "")).Allows(anon) {
		t.Fatal("anon must not read dm_only")
	}
	dmAudience := publishedLegacy(VisibilityDMOnly, "doc", "")
	dmAudience.Policy = json.RawMessage(`["role:dm"]`)
	if !Specify(dmAudience).Allows(ViewerScope{MemberID: "m1", Roles: []auth.Role{auth.DM}}) {
		t.Fatal("the DM audience policy must admit a viewer with the dm role")
	}
	if Specify(dmAudience).Allows(anon) {
		t.Fatal("a document DM audience must not give an anonymous viewer DM authority")
	}

	dm := ScopeFromClaims(auth.Claims{MemberID: "m1", Roles: []auth.Role{auth.DM}})
	if Specify(publishedLegacy(VisibilityDMOnly, "doc", "")).Allows(dm) {
		t.Fatal("token DM role must not establish live DM authority")
	}
	a, err := auth.NewAuthority("m1", []auth.Role{auth.DM}, "active", "approved")
	if err != nil || !Specify(publishedLegacy(VisibilityDMOnly, "doc", "")).Allows(ScopeFromAuthority(a)) {
		t.Fatal("live approved DM should read dm_only")
	}

	owner := ScopeFromClaims(auth.Claims{MemberID: "author"})
	if !Specify(publishedLegacy(VisibilityRestricted, "doc", "author")).Allows(owner) {
		t.Fatal("author should read own restricted")
	}
}

func TestGuestScopeReadsPlayerAudience(t *testing.T) {
	doc := publishedLegacy(VisibilityPublic, "doc", "author")
	doc.Policy = json.RawMessage(`["role:player"]`)
	guest, err := auth.NewAuthority("00000000-0000-4000-8000-000000000001", []auth.Role{auth.Guest}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	scope := ScopeFromAuthority(guest)
	if !Specify(doc).Allows(scope) {
		t.Fatal("a guest must read a player-audience document (D47)")
	}
	if !slices.Contains(SQLScope(scope).Roles, "player") {
		t.Fatal("the SQL viewer roles must carry player for a guest")
	}
	if guest.Claims().Has(auth.Player) {
		t.Fatal("the guest's claims must not gain player; only the document scope does")
	}
}

func TestRestrictedReaderUsesDocumentIdentityAndDMTier(t *testing.T) {
	tests := []struct {
		name  string
		scope ViewerScope
		want  bool
	}{
		{"granted DM", ViewerScope{MemberID: "reader", IsDM: true, ReaderOf: map[string]struct{}{"doc": {}}}, true},
		{"author UUID collision is not a grant", ViewerScope{MemberID: "reader", IsDM: true, ReaderOf: map[string]struct{}{"author": {}}}, false},
		{"other document grant", ViewerScope{MemberID: "reader", IsDM: true, ReaderOf: map[string]struct{}{"other": {}}}, false},
		{"non DM grant", ViewerScope{MemberID: "reader", ReaderOf: map[string]struct{}{"doc": {}}}, false},
		{"anonymous grant", ViewerScope{Anonymous: true, IsDM: true, ReaderOf: map[string]struct{}{"doc": {}}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Specify(publishedLegacy(VisibilityRestricted, "doc", "author")).Allows(tt.scope); got != tt.want {
				t.Fatalf("Allows=%v, want %v", got, tt.want)
			}
		})
	}
}
