package document

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestViewerScope(t *testing.T) {
	anon := ScopeFromClaims(auth.Claims{})
	if !anon.Allows(VisibilityPublic, "doc", "", nil) {
		t.Fatal("anon should read public")
	}
	if anon.Allows(VisibilityDMOnly, "doc", "", nil) {
		t.Fatal("anon must not read dm_only")
	}
	if anon.Allows(VisibilityDMOnly, "doc", "", []string{"dm"}) {
		t.Fatal("a document DM audience must not give an anonymous viewer DM authority")
	}

	dm := ScopeFromClaims(auth.Claims{MemberID: "m1", Roles: []auth.Role{auth.DM}})
	if dm.Allows(VisibilityDMOnly, "doc", "", nil) {
		t.Fatal("token DM role must not establish live DM authority")
	}
	a, err := auth.NewAuthority("m1", []auth.Role{auth.DM}, "active", "approved")
	if err != nil || !ScopeFromAuthority(a).Allows(VisibilityDMOnly, "doc", "", nil) {
		t.Fatal("live approved DM should read dm_only")
	}

	owner := ScopeFromClaims(auth.Claims{MemberID: "author"})
	if !owner.Allows(VisibilityRestricted, "doc", "author", nil) {
		t.Fatal("author should read own restricted")
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
			if got := tt.scope.Allows(VisibilityRestricted, "doc", "author", nil); got != tt.want {
				t.Fatalf("Allows=%v, want %v", got, tt.want)
			}
		})
	}
}
