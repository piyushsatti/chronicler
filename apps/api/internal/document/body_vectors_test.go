package document

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestLegacyWholeDocumentAccessDoesNotBypassBodyScopes(t *testing.T) {
	raw := "PUBLIC\n> [!DM]\n> DM-SECRET\n\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!dm:]\n> MALFORMED-SECRET\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	redacted := "PUBLIC\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	dmBody := "PUBLIC\n> [!DM]\n> DM-SECRET\n\n> [!redacted]\n> ████████████████████\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	memberBody := "PUBLIC\n> [!redacted]\n> ████████████████████\n\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!redacted]\n> ████████████████████\n\n> [!spoiler]\n> SPOILER-VISIBLE"
	for _, policy := range []json.RawMessage{nil, json.RawMessage(`null`)} {
		for _, visibility := range []Visibility{VisibilityPublic, VisibilityDMOnly, VisibilityRestricted} {
			d := Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: visibility, Policy: policy, Body: raw}
			for _, tc := range []struct {
				name       string
				scope      ViewerScope
				restricted bool
				dmOnly     bool
				want       string
			}{
				{"anonymous", ViewerScope{Anonymous: true}, false, false, redacted},
				{"matching player", ViewerScope{MemberID: "player", Handle: "Exact-Handle", Roles: []auth.Role{auth.Player}}, false, false, memberBody},
				{"approved DM with grant", ViewerScope{MemberID: "dm", Handle: "Other", Roles: []auth.Role{auth.DM}, IsDM: true, ReaderOf: map[string]struct{}{"doc": {}}}, true, true, dmBody},
				{"approved DM without grant", ViewerScope{MemberID: "dm", Handle: "Other", Roles: []auth.Role{auth.DM}, IsDM: true}, false, true, dmBody},
				{"role DM without approval", ViewerScope{MemberID: "dm", Handle: "Other", Roles: []auth.Role{auth.DM}, ReaderOf: map[string]struct{}{"doc": {}}}, false, false, dmBody},
				{"archon with grant", ViewerScope{MemberID: "archon", Handle: "Other", Roles: []auth.Role{auth.Role("archon")}, ReaderOf: map[string]struct{}{"doc": {}}}, true, true, redacted},
				{"matching archon with grant", ViewerScope{MemberID: "archon", Handle: "Exact-Handle", Roles: []auth.Role{auth.Role("archon")}, ReaderOf: map[string]struct{}{"doc": {}}}, true, true, memberBody},
				{"archon without grant", ViewerScope{MemberID: "archon", Roles: []auth.Role{auth.Role("archon")}}, false, true, redacted},
				{"author", ViewerScope{MemberID: "author", Roles: []auth.Role{auth.Player}}, true, true, raw},
				{"admin", ViewerScope{MemberID: "admin", Roles: []auth.Role{auth.Admin}, IsAdmin: true}, true, true, raw},
			} {
				t.Run(string(visibility)+"/"+string(policy)+"/"+tc.name, func(t *testing.T) {
					allowed := visibility == VisibilityPublic || (visibility == VisibilityDMOnly && tc.dmOnly) || (visibility == VisibilityRestricted && tc.restricted)
					body, err := d.EffectiveBody(tc.scope)
					if !allowed {
						if err != ErrForbidden || body != "" {
							t.Fatalf("outer denial regranted: body=%q err=%v", body, err)
						}
						return
					}
					if err != nil || body != tc.want {
						t.Fatalf("body=%q want=%q err=%v", body, tc.want, err)
					}
					if !tc.scope.Privileged() && !tc.scope.IsAuthor(d.AuthorID) && strings.Contains(body, "MALFORMED-SECRET") {
						t.Fatal("malformed audience escaped projection")
					}
				})
			}
		}
	}
}

func TestBodyBypassPreservesDraftAndInvalidPolicyAccess(t *testing.T) {
	raw := "> [!dm:]\n> AUTHOR-ADMIN-RAW-SECRET"
	for _, policy := range []json.RawMessage{nil, json.RawMessage(`null`), json.RawMessage(`[]`), json.RawMessage(`{}`)} {
		d := Document{ID: "doc", AuthorID: "author", Status: StatusDraft, Visibility: VisibilityPublic, Policy: policy, Body: raw}
		for _, scope := range []ViewerScope{
			{MemberID: "author", Roles: []auth.Role{auth.Player}},
			{MemberID: "admin", Roles: []auth.Role{auth.Admin}, IsAdmin: true},
		} {
			if body, err := d.EffectiveBody(scope); err != nil || body != raw {
				t.Fatalf("draft author/admin body=%q err=%v", body, err)
			}
		}
		if body, err := d.EffectiveBody(ViewerScope{MemberID: "other", Roles: []auth.Role{auth.DM}, IsDM: true}); err != ErrForbidden || body != "" {
			t.Fatalf("draft regranted through block: body=%q err=%v", body, err)
		}
	}
}
