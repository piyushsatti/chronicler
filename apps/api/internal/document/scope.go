package document

import (
	"slices"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// Visibility of a published document.
type Visibility string

const (
	VisibilityPublic     Visibility = "public"
	VisibilityDMOnly     Visibility = "dm_only"
	VisibilityRestricted Visibility = "restricted"
)

// ViewerScope is the single specification for document visibility (SQL and in-memory).
type ViewerScope struct {
	MemberID  string
	Roles     []auth.Role
	IsAdmin   bool
	IsDM      bool
	ReaderOf  map[string]struct{} // document ids explicitly granted
	Anonymous bool
}

func ScopeFromClaims(c auth.Claims) ViewerScope {
	if c.Anonymous() {
		return ViewerScope{Anonymous: true, ReaderOf: map[string]struct{}{}}
	}
	return ViewerScope{
		MemberID:  c.MemberID,
		Roles:     c.Roles,
		IsAdmin:   c.Has(auth.Admin),
		IsDM:      c.Has(auth.DM),
		ReaderOf:  map[string]struct{}{},
		Anonymous: false,
	}
}

// Allows reports whether the viewer may read a published document with the given visibility.
// Drafts are author/admin only and are handled by the caller before this check.
func (s ViewerScope) Allows(visibility Visibility, authorID string, policyAudiences []string) bool {
	if s.IsAdmin {
		return true
	}
	if authorID != "" && authorID == s.MemberID {
		return true
	}
	switch visibility {
	case VisibilityPublic:
		return true
	case VisibilityDMOnly:
		return s.IsDM || slices.Contains(policyAudiences, "dm")
	case VisibilityRestricted:
		if _, ok := s.ReaderOf[authorID]; ok {
			return true
		}
		for _, a := range policyAudiences {
			if a == "member:"+s.MemberID {
				return true
			}
		}
		return false
	default:
		return false
	}
}
