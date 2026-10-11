package document

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type markerFixture struct {
	HandleCharset string `json:"handle_charset"`
	Cases         []struct {
		Name   string     `json:"name"`
		Body   string     `json:"body"`
		Spans  []bodySpan `json:"spans"`
		Public string     `json:"public_body"`
		DM     string     `json:"dm_body"`
		Member string     `json:"member_body"`
	} `json:"cases"`
}

func sharedMarkerFixtures(t *testing.T) markerFixture {
	t.Helper()
	path := filepath.Join("..", "..", "..", "..", "packages", "contracts", "fixtures", "audience-markers.v1.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixture markerFixture
	if err := json.Unmarshal(raw, &fixture); err != nil || len(fixture.Cases) == 0 {
		t.Fatalf("shared fixture err=%v", err)
	}
	return fixture
}

func TestSharedAudienceMarkerConformance(t *testing.T) {
	fixture := sharedMarkerFixtures(t)
	if markerHandlePattern.String() != "^@"+fixture.HandleCharset+"$" {
		t.Fatal("runtime marker charset disagrees with shared ruling fixture")
	}
	for _, tc := range fixture.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			if spans := parseBody(tc.Body); !reflect.DeepEqual(spans, tc.Spans) {
				t.Fatalf("spans=%+v want=%+v", spans, tc.Spans)
			}
			for _, viewer := range []struct {
				name  string
				scope ViewerScope
				want  string
			}{
				{"public", ViewerScope{Anonymous: true}, tc.Public},
				{"DM", ViewerScope{MemberID: "viewer", Roles: []auth.Role{auth.DM}, Handle: "Other"}, tc.DM},
				{"member", ViewerScope{MemberID: "viewer", Roles: []auth.Role{auth.Player}, Handle: "Exact-Handle"}, tc.Member},
				{"author", ViewerScope{MemberID: "author", Roles: []auth.Role{auth.Player}}, tc.Body},
				{"admin", ViewerScope{MemberID: "admin", Roles: []auth.Role{auth.Admin}, IsAdmin: true}, tc.Body},
			} {
				policies := []json.RawMessage{nil, json.RawMessage(`null`)}
				if viewer.scope.Authenticated() {
					policies = append(policies, json.RawMessage(`["role:player","role:dm","role:admin"]`))
				}
				for _, policy := range policies {
					d := Document{ID: "fixture", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: tc.Body, Policy: policy}
					body, err := d.EffectiveBody(viewer.scope)
					if err != nil || body != viewer.want {
						t.Fatalf("%s policy=%s body=%q want=%q err=%v", viewer.name, policy, body, viewer.want, err)
					}
				}
			}
		})
	}
}

func TestBodyCannotRegrantDeniedOuterDocument(t *testing.T) {
	for _, policy := range []json.RawMessage{json.RawMessage(`[]`), json.RawMessage(`{}`), json.RawMessage(`["!member:@Exact-Handle","role:player"]`)} {
		d := Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Policy: policy, Body: "> [!dm:@Exact-Handle]\n> OUTER-DENIED-SECRET\nPlain text"}
		body, err := d.EffectiveBody(ViewerScope{MemberID: "member", Handle: "Exact-Handle", Roles: []auth.Role{auth.Player, auth.DM}})
		if err != ErrForbidden || body != "" {
			t.Fatalf("outer policy %s regranted: %q err=%v", policy, body, err)
		}
	}
}

func TestMemberMarkerPreservesExactAcceptedCharsetHandle(t *testing.T) {
	for _, handle := range []string{"Exact-Handle", "Under_score", "dot.handle", "ALPHA09"} {
		d := Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Policy: json.RawMessage(`["role:player"]`), Body: "> [!DM:@" + handle + "]\n> HANDLE-SECRET"}
		match := ViewerScope{MemberID: "member", Handle: handle, Roles: []auth.Role{auth.Player}}
		if body, err := d.EffectiveBody(match); err != nil || body != d.Body {
			t.Fatalf("current handle %q did not match: %q %v", handle, body, err)
		}
		match.Handle = "Other"
		if body, err := d.EffectiveBody(match); err != nil || body != redactedBlock {
			t.Fatalf("other handle admitted %q: %q %v", handle, body, err)
		}
	}
}

func TestFirstMultipleHandleSourceBehaviorPreserved(t *testing.T) {
	d := Document{ID: "doc", Status: StatusPublished, Policy: json.RawMessage(`["role:player"]`), Body: "> [!dm:@First]\n> [!dm:@Second]\n> SECRET"}
	for _, tc := range []struct{ handle, want string }{{"First", d.Body}, {"Second", redactedBlock}} {
		body, err := d.EffectiveBody(ViewerScope{MemberID: "member", Handle: tc.handle, Roles: []auth.Role{auth.Player}})
		if err != nil || body != tc.want {
			t.Fatalf("handle=%s body=%q err=%v", tc.handle, body, err)
		}
	}
}

func TestBodyProjectionOccursAtEveryDocumentQueryBoundary(t *testing.T) {
	raw := Document{ID: "doc", Slug: "fixture", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: "Visible\n> [!DM]\n> RAW-SECRET\n\n> [!note]\n> Visible note"}
	q := Queries{Repo: policyReadRepo{document: raw}}
	expected := "Visible\n> [!redacted]\n\n> [!note]\n> Visible note"
	id, err := q.ByID(context.Background(), "doc")
	if err != nil || id.Body != expected {
		t.Fatalf("ByID=%q err=%v", id.Body, err)
	}
	slug, err := q.BySlug(context.Background(), "fixture")
	if err != nil || slug.Body != expected {
		t.Fatalf("BySlug=%q err=%v", slug.Body, err)
	}
	list, total, err := q.List(context.Background(), ListFilter{})
	if err != nil || total != 1 || len(list) != 1 || list[0].Body != expected {
		t.Fatalf("List=%+v total=%d err=%v", list, total, err)
	}
	batch, err := (BatchLoader{Queries: q}).LoadMany(context.Background(), []string{"doc"})
	if err != nil || len(batch) != 1 || batch[0].Body != expected {
		t.Fatalf("Batch=%+v err=%v", batch, err)
	}
	if strings.Contains(id.Body, "RAW-SECRET") || strings.Contains(slug.Body, "RAW-SECRET") || strings.Contains(list[0].Body, "RAW-SECRET") || strings.Contains(batch[0].Body, "RAW-SECRET") {
		t.Fatal("raw secret escaped query boundary")
	}
	// A repository's source is never mutated into a viewer-dependent cache.
	if q.Repo.(policyReadRepo).document.Body != raw.Body {
		t.Fatal("repository body was mutated")
	}
}

func TestAdminBlockOverrideAuditOmitsProtectedBytes(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	raw := Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: "> [!dm:@Other]\n> DO-NOT-LOG-SECRET"}
	q := Queries{Repo: policyReadRepo{document: raw}}
	d, err := q.ByID(verifiedContext(t, "admin", []auth.Role{auth.Admin}), "doc")
	if err != nil || d.Body != raw.Body {
		t.Fatalf("admin body=%q err=%v", d.Body, err)
	}
	if !strings.Contains(output.String(), "audience.admin_override") || strings.Contains(output.String(), "DO-NOT-LOG-SECRET") || strings.Contains(output.String(), "member:@Other") {
		t.Fatalf("audit=%s", &output)
	}
}

func TestHiddenSpanShapeDoesNotRevealSecretLength(t *testing.T) {
	for _, secret := range []string{"x", strings.Repeat("long secret", 1000), "one\n> two\n> three"} {
		d := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: "> [!DM]\n> " + secret}
		body, err := d.EffectiveBody(ViewerScope{Anonymous: true})
		if err != nil || body != redactedBlock {
			t.Fatalf("redacted shape=%q err=%v", body, err)
		}
	}
}

func TestExplicitDMBlockHasNoArchonHierarchy(t *testing.T) {
	d := Document{ID: "doc", Status: StatusPublished, Policy: json.RawMessage(`["role:archon"]`), Body: "> [!DM]\n> DM-SECRET"}
	body, err := d.EffectiveBody(ViewerScope{MemberID: "archon", Roles: []auth.Role{auth.Role("archon")}})
	if err != nil || body != redactedBlock {
		t.Fatalf("archon gained explicit DM block: %q %v", body, err)
	}
}

func TestUnsupportedMarkerHandlesFailClosedWithoutRestrictingDocumentPolicy(t *testing.T) {
	for _, handle := range []string{"Space Handle", "colon:handle", "éxact", "emoji🐉", "with/slash", `quoted"handle`, "Bad]Handle", "Bad\nHandle"} {
		policy, _ := json.Marshal([]string{"member:@" + handle})
		scope := ViewerScope{MemberID: "member", Handle: handle, Roles: []auth.Role{auth.Player}}
		d := Document{ID: "doc", Status: StatusPublished, Policy: policy, Body: "Visible ordinary body"}
		if body, err := d.EffectiveBody(scope); err != nil || body != d.Body {
			t.Fatalf("DB/document principal handle %q was restricted: %q %v", handle, body, err)
		}
		// Quote-prefixed continuation keeps the attempted multiline marker
		// within one maximal callout span; unquoted prose starts a new span.
		d.Body = "> [!DM:@" + strings.ReplaceAll(handle, "\n", "\n> ") + "]\n> UNSUPPORTED-HANDLE-SECRET"
		if body, err := d.EffectiveBody(scope); err != nil || strings.Contains(body, "UNSUPPORTED-HANDLE-SECRET") {
			t.Fatalf("unsupported marker handle %q leaked: %q %v", handle, body, err)
		}
	}
}

func TestSQLAudienceAuditRequiresPrivilegedActorAndActualActivation(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	admin := ViewerScope{MemberID: "admin", IsAdmin: true}
	for _, tc := range []struct {
		scope     ViewerScope
		activated bool
		want      bool
	}{
		{admin, true, true}, {admin, false, false},
		{ViewerScope{MemberID: "member"}, true, false},
		{ViewerScope{Anonymous: true, IsAdmin: true}, true, false},
	} {
		output.Reset()
		AuditSQLOverride(context.Background(), tc.scope, tc.activated, "documents", "count")
		if got := strings.Contains(output.String(), "audience.admin_override"); got != tc.want {
			t.Fatalf("audit=%s want=%v", &output, tc.want)
		}
	}
}
