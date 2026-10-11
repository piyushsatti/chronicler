package document

import (
	"encoding/json"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

const policyMemberID = "10000000-0000-0000-0000-000000000001"
const policyAuthorID = "10000000-0000-0000-0000-000000000002"
const policyDocumentID = "20000000-0000-0000-0000-000000000001"

type policyCase struct {
	name  string
	doc   Document
	scope ViewerScope
	want  bool
}

// The same cases run against the loaded-row and native SQL interpreters.
func policyConformanceCases() []policyCase {
	member := ViewerScope{MemberID: policyMemberID, Handle: "Exact-Handle", Roles: []auth.Role{auth.Player}}
	dm := member
	dm.Roles, dm.IsDM = []auth.Role{auth.DM, auth.Player}, true
	revoked := dm
	revoked.IsDM = false
	archon := member
	archon.Roles = []auth.Role{auth.Role("archon")}
	admin := member
	admin.Roles, admin.IsAdmin = []auth.Role{auth.Admin}, true
	author := member
	author.MemberID = policyAuthorID
	archonReader := archon
	archonReader.ReaderOf = map[string]struct{}{policyDocumentID: {}}
	archonCollision := archon
	archonCollision.ReaderOf = map[string]struct{}{policyAuthorID: {}}
	revokedArchon := archonReader
	revokedArchon.Roles = []auth.Role{auth.Player}
	reader := dm
	reader.ReaderOf = map[string]struct{}{policyDocumentID: {}}
	collision := dm
	collision.ReaderOf = map[string]struct{}{policyAuthorID: {}}
	renamed := member
	renamed.Handle = "Renamed"
	otherCase := member
	otherCase.Handle = "exact-handle"
	base := Document{ID: policyDocumentID, AuthorID: policyAuthorID, Status: StatusPublished, Visibility: VisibilityPublic}
	makeCase := func(name string, scope ViewerScope, policy string, want bool) policyCase {
		d := base
		if policy != "" {
			d.Policy = json.RawMessage(policy)
		}
		return policyCase{name, d, scope, want}
	}
	cases := []policyCase{
		makeCase("SQL NULL anonymous legacy public", ViewerScope{Anonymous: true}, "", true),
		makeCase("JSON null anonymous legacy public", ViewerScope{Anonymous: true}, "null", true),
		makeCase("whitespace JSON null legacy public", ViewerScope{Anonymous: true}, "  null \n", true),
		makeCase("empty overrides public", member, "[]", false),
		makeCase("anonymous cannot match member or role", ViewerScope{Anonymous: true, MemberID: policyMemberID, Roles: []auth.Role{auth.Player}}, `["role:player","member:`+policyMemberID+`"]`, false),
		makeCase("member deny beats member allow", member, `["!member:@Exact-Handle","member:`+policyMemberID+`","role:player"]`, false),
		makeCase("member allow beats role deny", member, `["member:@Exact-Handle","!role:player"]`, true),
		makeCase("role deny beats role allow", dm, `["!role:player","role:dm"]`, false),
		makeCase("role allow", member, `["role:player"]`, true),
		makeCase("member UUID allow", member, `["member:`+policyMemberID+`"]`, true),
		makeCase("member UUID deny", member, `["!member:`+policyMemberID+`","role:player"]`, false),
		makeCase("exact handle allow", member, `["member:@Exact-Handle"]`, true),
		makeCase("handle case preserved", otherCase, `["member:@Exact-Handle"]`, false),
		makeCase("renamed handle loses old allow", renamed, `["member:@Exact-Handle"]`, false),
		makeCase("renamed handle loses old deny", renamed, `["!member:@Exact-Handle","role:player"]`, true),
		makeCase("unknown role default deny", member, `["role:not-a-role"]`, false),
		makeCase("unknown member default deny", member, `["member:@nobody"]`, false),
		makeCase("unknown role does not invalidate intentional grant", member, `["role:not-a-role","role:player"]`, true),
		makeCase("principal values remain permissive", member, `["member:@Exact-Handle:extra"]`, false),
		makeCase("object fails closed", member, `{}`, false),
		makeCase("scalar fails closed", member, `"role:player"`, false),
		makeCase("number fails closed", member, `42`, false),
		makeCase("non-string principal fails closed", member, `["role:player",null]`, false),
		makeCase("malformed token fails closed despite grant", member, `["role:player","role:"]`, false),
		makeCase("unknown principal kind fails closed", member, `["role:player","group:any"]`, false),
		makeCase("author bypasses explicit deny", author, `["!member:`+policyAuthorID+`"]`, true),
		makeCase("author bypasses malformed shape", author, `{}`, true),
		makeCase("admin bypasses explicit deny", admin, `["!member:@Exact-Handle"]`, true),
		makeCase("admin bypasses malformed shape", admin, `{}`, true),
		makeCase("explicit DM matches current role without invented profile restriction", revoked, `["role:dm"]`, true),
		makeCase("archon has no explicit DM hierarchy", archon, `["role:dm"]`, false),
	}
	for _, role := range []string{"player", "dm", "archon", "lieutenant", "verifier", "admin"} {
		scope := member
		scope.Roles = []auth.Role{auth.Role(role)}
		cases = append(cases, makeCase("exact current role "+role, scope, `["role:`+role+`"]`, true))
	}
	for _, tc := range []struct {
		name       string
		visibility Visibility
		scope      ViewerScope
		want       bool
	}{
		{"approved DM legacy", VisibilityDMOnly, dm, true},
		{"revoked profile legacy", VisibilityDMOnly, revoked, false},
		{"current archon legacy tier independent of DM profile", VisibilityDMOnly, archon, true},
		{"archon exact reader document", VisibilityRestricted, archonReader, true},
		{"archon missing reader grant", VisibilityRestricted, archon, false},
		{"archon wrong document reader", VisibilityRestricted, archonCollision, false},
		{"revoked archon role loses reader", VisibilityRestricted, revokedArchon, false},
		{"anonymous archon flags do not grant tier", VisibilityDMOnly, ViewerScope{Anonymous: true, MemberID: policyMemberID, Roles: []auth.Role{auth.Role("archon")}}, false},
		{"exact reader document", VisibilityRestricted, reader, true},
		{"author namespace collision", VisibilityRestricted, collision, false},
		{"non-DM reader", VisibilityRestricted, ViewerScope{MemberID: policyMemberID, ReaderOf: map[string]struct{}{policyDocumentID: {}}}, false},
	} {
		for _, policy := range []string{"", "null"} {
			c := makeCase(tc.name+" "+policy, tc.scope, policy, tc.want)
			c.doc.Visibility = tc.visibility
			cases = append(cases, c)
		}
	}
	draft := base
	draft.Status = StatusDraft
	draft.Policy = json.RawMessage(`["role:player"]`)
	cases = append(cases, policyCase{"draft cannot be granted", draft, member, false}, policyCase{"author draft", draft, author, true}, policyCase{"admin draft", draft, admin, true})
	draft.AuthorID = ""
	cases = append(cases, policyCase{"authorless anonymous draft", draft, ViewerScope{Anonymous: true}, false}, policyCase{"authorless member draft", draft, member, false})
	return cases
}

func TestWholeDocumentSpecification(t *testing.T) {
	for _, tc := range policyConformanceCases() {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.doc.Readable(tc.scope); got != tc.want {
				t.Fatalf("Readable=%v want=%v", got, tc.want)
			}
		})
	}
}
