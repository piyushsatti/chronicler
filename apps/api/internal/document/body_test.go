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
		if body, err := d.EffectiveBody(match); err != nil || body != "> [!redacted]\n"+redactedBars(20) {
			t.Fatalf("other handle admitted %q: %q %v", handle, body, err)
		}
	}
}

func TestFirstMultipleHandleSourceBehaviorPreserved(t *testing.T) {
	d := Document{ID: "doc", Status: StatusPublished, Policy: json.RawMessage(`["role:player"]`), Body: "> [!dm:@First]\n> [!dm:@Second]\n> SECRET"}
	for _, tc := range []struct{ handle, want string }{{"First", d.Body}, {"Second", "> [!redacted]\n" + redactedBars(20)}} {
		body, err := d.EffectiveBody(ViewerScope{MemberID: "member", Handle: tc.handle, Roles: []auth.Role{auth.Player}})
		if err != nil || body != tc.want {
			t.Fatalf("handle=%s body=%q err=%v", tc.handle, body, err)
		}
	}
}

func TestBodyProjectionOccursAtEveryDocumentQueryBoundary(t *testing.T) {
	raw := Document{ID: "doc", Slug: "fixture", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: "Visible\n> [!DM]\n> RAW-SECRET\n\n> [!note]\n> Visible note"}
	q := Queries{Repo: policyReadRepo{document: raw}}
	expected := "Visible\n> [!redacted]\n" + redactedBars(20) + "\n\n> [!note]\n> Visible note"
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

// redactedBars spells one expected D45 bar line literally, independent of the
// implementation's helper.
func redactedBars(n int) string { return "> " + strings.Repeat("█", n) }

// D45: a hidden span keeps its exact line count and each line's length rounded
// up to the next multiple of 20 runes; the marker-only line and secret bytes
// never appear.
func TestHiddenSpanKeepsRoughSizeOnly(t *testing.T) {
	for _, tc := range []struct{ name, body, want string }{
		{"3 runes", "> [!DM]\n> abc", "> [!redacted]\n" + redactedBars(20)},
		{"19 runes", "> [!DM]\n> " + strings.Repeat("s", 19), "> [!redacted]\n" + redactedBars(20)},
		{"20 runes", "> [!DM]\n> " + strings.Repeat("s", 20), "> [!redacted]\n" + redactedBars(20)},
		{"21 runes", "> [!DM]\n> " + strings.Repeat("s", 21), "> [!redacted]\n" + redactedBars(40)},
		{"multi-line keeps line count", "> [!dm]\n> one\n> " + strings.Repeat("t", 25) + "\n> three", "> [!redacted]\n" + redactedBars(20) + "\n" + redactedBars(40) + "\n" + redactedBars(20)},
		{"blank line stays blank", "> [!dm]\n> one\n>\n> two", "> [!redacted]\n" + redactedBars(20) + "\n>\n" + redactedBars(20)},
		{"unicode counts runes not bytes", "> [!dm]\n> " + strings.Repeat("é", 19) + "\n> " + strings.Repeat("🐉", 21), "> [!redacted]\n" + redactedBars(20) + "\n" + redactedBars(40)},
		{"marker line with title counts its text", "> [!DM] Secret title\n> body", "> [!redacted]\n" + redactedBars(20) + "\n" + redactedBars(20)},
		{"bare marker counts text beside marker", "[!dm] hello", "> [!redacted]\n" + redactedBars(20)},
		{"marker only", "> [!dm]", "> [!redacted]"},
		{"long line caps at 200 bars", "> [!DM]\n> " + strings.Repeat("long secret", 100), "> [!redacted]\n" + redactedBars(200)},
		{"200-rune line is not cut", "> [!DM]\n> " + strings.Repeat("s", 200), "> [!redacted]\n" + redactedBars(200)},
		{"100 lines are not cut", "> [!DM]" + strings.Repeat("\n> x", 100), "> [!redacted]" + strings.Repeat("\n"+redactedBars(20), 100)},
		{"101st line becomes a count", "> [!DM]" + strings.Repeat("\n> x", 101), "> [!redacted]" + strings.Repeat("\n"+redactedBars(20), 100) + "\n> +1 more line"},
		{"cut lines include blanks", "> [!DM]" + strings.Repeat("\n> x", 100) + "\n>\n> x\n> x", "> [!redacted]" + strings.Repeat("\n"+redactedBars(20), 100) + "\n> +3 more lines"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: tc.body}
			body, err := d.EffectiveBody(ViewerScope{Anonymous: true})
			if err != nil || body != tc.want {
				t.Fatalf("redacted shape=%q want=%q err=%v", body, tc.want, err)
			}
		})
	}
	short, _ := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: "> [!DM]\n> yes"}.EffectiveBody(ViewerScope{Anonymous: true})
	name, _ := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: "> [!DM]\n> " + strings.Repeat("n", 19)}.EffectiveBody(ViewerScope{Anonymous: true})
	if short == "" || short != name {
		t.Fatalf("3-rune and 19-rune secrets are distinguishable: %q vs %q", short, name)
	}
	if strings.ContainsAny(strings.ReplaceAll(strings.ReplaceAll(short, "[!redacted]", ""), "█", ""), "yesn") {
		t.Fatalf("secret bytes escaped: %q", short)
	}
}

// D45 document budget: 10,000 bar runes per projection. Spans spend it in
// order; afterwards a hidden span is its marker plus a line count, no bars.
func TestRedactionBarBudgetBoundsWholeBody(t *testing.T) {
	const spans = 128 * 1024 / 8
	raw := strings.Repeat("[!dm] x\n", spans)
	body, err := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: raw}.EffectiveBody(ViewerScope{Anonymous: true})
	blocks := make([]string, spans)
	for i := range blocks {
		blocks[i] = "> [!redacted]\n> +1 more line"
		if i < 500 { // 500 spans × 20 bars spend the budget exactly
			blocks[i] = "> [!redacted]\n" + redactedBars(20)
		}
	}
	if want := strings.Join(blocks, "\n\n") + "\n"; err != nil || body != want {
		t.Fatalf("bytes=%d want=%d head=%q err=%v", len(body), len(want), body[:min(len(body), 80)], err)
	}
	// The per-span placeholder text itself (~30 bytes for 8 input bytes) is
	// the floor once bars stop; bars no longer grow with the body.
	if len(body) > 4*len(raw) || strings.Count(body, "█") != 10000 {
		t.Fatalf("bytes=%d input=%d bars=%d", len(body), len(raw), strings.Count(body, "█"))
	}
	crossing := "> [!DM]" + strings.Repeat("\n> "+strings.Repeat("s", 200), 100) + "\n\n[!dm] later"
	body, err = Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: crossing}.EffectiveBody(ViewerScope{Anonymous: true})
	want := "> [!redacted]" + strings.Repeat("\n"+redactedBars(200), 50) + "\n> +50 more lines\n\n> [!redacted]\n> +1 more line"
	if err != nil || body != want {
		t.Fatalf("crossing span body tail=%q err=%v", body[max(0, len(body)-60):], err)
	}
}

// D45 caps: a 128 KiB run of one-rune hidden lines must not amplify into
// megabytes of bars.
func TestHiddenSpanShapeAmplificationIsBounded(t *testing.T) {
	raw := "> [!DM]" + strings.Repeat("\n> x", 128*1024/4)
	body, err := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: raw}.EffectiveBody(ViewerScope{Anonymous: true})
	if err != nil || strings.Count(body, "\n") != 101 || len(body) > 8*1024 || !strings.HasSuffix(body, "\n> +32668 more lines") {
		t.Fatalf("lines=%d bytes=%d tail=%q err=%v", strings.Count(body, "\n"), len(body), body[max(0, len(body)-24):], err)
	}
}

// D45: a placeholder never shares a blockquote or paragraph with the next
// span, so every consumer sees the redaction end where the hidden span ended.
func TestRedactionPlaceholderEndsBeforeFollowingContent(t *testing.T) {
	bar := "> [!redacted]\n" + redactedBars(20)
	for _, tc := range []struct{ name, body, want string }{
		{"bare line before public quote", "Bare [!dm] SECRET\n> [!note]\n> Public note", bar + "\n\n> [!note]\n> Public note"},
		{"bare line before prose", "[!dm] SECRET\nOrdinary line", bar + "\n\nOrdinary line"},
		{"adjacent hidden bare lines", "[!dm] one\n[!dm] two", bar + "\n\n" + bar},
		{"existing blank separator kept single", "> [!dm]\n> SECRET\n\nAfter", bar + "\n\nAfter"},
		{"visible text before stays adjacent", "Before\n> [!dm]\n> SECRET", "Before\n" + bar},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: tc.body}.EffectiveBody(ViewerScope{Anonymous: true})
			if err != nil || body != tc.want {
				t.Fatalf("body=%q want=%q err=%v", body, tc.want, err)
			}
		})
	}
}

func TestExplicitDMBlockHasNoArchonHierarchy(t *testing.T) {
	d := Document{ID: "doc", Status: StatusPublished, Policy: json.RawMessage(`["role:archon"]`), Body: "> [!DM]\n> DM-SECRET"}
	body, err := d.EffectiveBody(ViewerScope{MemberID: "archon", Roles: []auth.Role{auth.Role("archon")}})
	if err != nil || body != "> [!redacted]\n"+redactedBars(20) {
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
