package document

import (
	"bytes"
	"encoding/json"
	"slices"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

// Specification is the whole-document audience rule (D3/D28). Allows is its
// loaded-row interpreter; document_readable in 0001 is its SQL interpreter.
// Both share the conformance matrix in the policy integration tests.
type Specification struct {
	document   Document
	principals []principal
	valid      bool
	legacy     bool
}

type principal struct {
	kind  string
	value string
	deny  bool
}

func Specify(d Document) Specification {
	s := Specification{document: d, valid: true}
	if len(d.Policy) == 0 || bytes.Equal(bytes.TrimSpace(d.Policy), []byte("null")) {
		s.legacy = true
		return s
	}
	var tokens []string
	if err := json.Unmarshal(d.Policy, &tokens); err != nil || tokens == nil {
		s.valid = false
		return s
	}
	for _, token := range tokens {
		p := principal{deny: strings.HasPrefix(token, "!")}
		body := strings.TrimPrefix(token, "!")
		kind, value, ok := strings.Cut(body, ":")
		if !ok || (kind != "role" && kind != "member") || value == "" {
			s.valid = false
			return s
		}
		p.kind, p.value = kind, value
		s.principals = append(s.principals, p)
	}
	return s
}

func (s Specification) Allows(viewer ViewerScope) bool {
	if viewer.Privileged() || viewer.IsAuthor(s.document.AuthorID) {
		return true
	}
	if s.document.Status != StatusPublished || !s.valid {
		return false
	}
	if s.legacy {
		return s.compileLegacy(viewer)
	}
	if !viewer.Authenticated() {
		return false
	}
	var memberDeny, memberAllow, roleDeny, roleAllow bool
	for _, p := range s.principals {
		switch p.kind {
		case "member":
			if p.value == viewer.MemberID || (viewer.Handle != "" && p.value == "@"+viewer.Handle) {
				if p.deny {
					memberDeny = true
				} else {
					memberAllow = true
				}
			}
		case "role":
			if slices.Contains(viewer.Roles, auth.Role(p.value)) {
				if p.deny {
					roleDeny = true
				} else {
					roleAllow = true
				}
			}
		}
	}
	return !memberDeny && (memberAllow || (!roleDeny && roleAllow))
}

// compileLegacy preserves approved role-DM and current archon legacy grants. It
// deliberately grants no hierarchy to explicit role principals: those match
// exact current role strings, including archon/lieutenant/verifier.
func (s Specification) compileLegacy(viewer ViewerScope) bool {
	switch s.document.Visibility {
	case VisibilityPublic:
		return true
	case VisibilityDMOnly:
		return viewer.LegacyDMTier()
	case VisibilityRestricted:
		_, reader := viewer.ReaderOf[s.document.ID]
		return viewer.LegacyDMTier() && s.document.ID != "" && reader
	default:
		return false
	}
}
