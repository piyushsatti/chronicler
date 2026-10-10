package document

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestViewerScope(t *testing.T) {
	anon := ScopeFromClaims(auth.Claims{})
	if !anon.Allows(VisibilityPublic, "", nil) {
		t.Fatal("anon should read public")
	}
	if anon.Allows(VisibilityDMOnly, "", nil) {
		t.Fatal("anon must not read dm_only")
	}

	dm := ScopeFromClaims(auth.Claims{MemberID: "m1", Roles: []auth.Role{auth.DM}})
	if !dm.Allows(VisibilityDMOnly, "", nil) {
		t.Fatal("dm should read dm_only")
	}

	owner := ScopeFromClaims(auth.Claims{MemberID: "author"})
	if !owner.Allows(VisibilityRestricted, "author", nil) {
		t.Fatal("author should read own restricted")
	}
}
