package document

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"slices"
)

// Visibility of a published document.
type Visibility string

const (
	VisibilityPublic     Visibility = "public"
	VisibilityDMOnly     Visibility = "dm_only"
	VisibilityRestricted Visibility = "restricted"
)

// ViewerScope is request-local viewer authority for the audience Specification.
type ViewerScope struct {
	MemberID  string
	Handle    string // exact current members.handle, never token-provided
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
		ReaderOf:  map[string]struct{}{},
		Anonymous: false,
	}
}

func ScopeFromAuthority(a auth.Authority) ViewerScope {
	c := a.Claims()
	scope := ScopeFromClaims(c)
	scope.Roles = c.Roles
	scope.Handle = a.Handle()
	scope.IsAdmin = c.Has(auth.Admin)
	scope.IsDM = a.LiveDM()
	return scope
}

func (s ViewerScope) Authenticated() bool { return !s.Anonymous && s.MemberID != "" }
func (s ViewerScope) Privileged() bool    { return s.Authenticated() && s.IsAdmin }

// LegacyDMTier preserves the source's separate archon legacy grant. It does
// not establish command authority or imply a hierarchy for explicit roles.
func (s ViewerScope) LegacyDMTier() bool {
	return s.Authenticated() && (s.IsDM || slices.Contains(s.Roles, auth.Role("archon")))
}
func (s ViewerScope) IsAuthor(id string) bool {
	return s.Authenticated() && id != "" && id == s.MemberID
}

// Allows is the compatibility entry point for the legacy visibility compiler.
// New reads always specify the full Document, including its nullable policy.
func (s ViewerScope) Allows(visibility Visibility, documentID, authorID string, _ []string) bool {
	return Specify(Document{ID: documentID, AuthorID: authorID, Status: StatusPublished, Visibility: visibility}).Allows(s)
}
