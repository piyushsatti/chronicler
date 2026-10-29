package document

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func auditText(s string) *string { return &s }

func TestAuditBodyIncludesLazyContinuationLines(t *testing.T) {
	body := "> [!dm]\n> one\ntwo\n\nPublic"
	records := AuditBody(body)
	if len(records) != 1 || records[0].Kind != BodySpanDM || records[0].StartLine != 1 || records[0].EndLine != 3 {
		t.Fatalf("audit=%s, want DM span covering lines 1-3", describeAudit(records))
	}
	checkTokenRange(t, strings.Split(body, "\n"), records[0])
}

func TestAuditBodyWarnsForListNestedAudienceMarkers(t *testing.T) {
	bars := "> [!redacted]\n" + redactedBars(20)
	for _, tc := range []struct {
		name, body, projected string
		line, column          int
	}{
		{"direct bullet", "- > [!dm]\n  > secret", bars + "\n\n  > secret", 1, 5},
		{"plus bullet", "+ > [!dm]\n  > secret", bars + "\n\n  > secret", 1, 5},
		{"star bullet", "* > [!dm]\n  > secret", bars + "\n\n  > secret", 1, 5},
		{"numbered continuation", "10. item\n    > [!dm]\n    > secret", "10. item\n> [!redacted]\n\n    > secret", 2, 7},
		{"numbered direct marker", "10) > [!dm]\n    > secret", bars + "\n\n    > secret", 1, 7},
		{"member marker", "- > [!dm:@Exact-Handle]\n  > secret", bars + "\n\n  > secret", 1, 5},
		{"nested list", "- item\n  1. > [!dm]\n     > secret", "- item\n" + bars + "\n\n     > secret", 2, 8},
		{"indented marker without list context", "    > [!dm]\n    > secret", "> [!redacted]\n\n    > secret", 1, 7},
		{"nine digit list prefix", "123456789. > [!dm]\n            > secret", bars + "\n\n            > secret", 1, 14},
		{"spoiler marker", "- > [!spoiler]\n  > secret", "- > [!spoiler]\n  > secret", 1, 5},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var warnings []BodySpanAudit
			for _, record := range AuditBody(tc.body) {
				if record.Kind == BodySpanKind("LIST_NESTED") {
					warnings = append(warnings, record)
				}
			}
			if len(warnings) != 1 {
				t.Fatalf("warnings=%s, want one list-nested diagnostic", describeAudit(warnings))
			}
			warning := warnings[0]
			checkTokenRange(t, strings.Split(tc.body, "\n"), warning)
			if warning.StartLine != tc.line || warning.EndLine != tc.line || *warning.TokenLine != tc.line || *warning.TokenColumn != tc.column || warning.Suggestion != nil {
				t.Fatalf("warning=%+v, want line %d column %d without a token replacement", warning, tc.line, tc.column)
			}
			d := Document{ID: "doc", Status: StatusPublished, Visibility: VisibilityPublic, Body: tc.body}
			if body, err := d.EffectiveBody(ViewerScope{Anonymous: true}); err != nil || body != tc.projected {
				t.Fatalf("list projection=%q want %q err=%v", body, tc.projected, err)
			}
		})
	}
	for _, body := range []string{
		"`- > [!dm]`",
		`\- > [!dm]`,
		"- item\n\n> [!dm]\n> secret",
		"- item\n  > [!dm@typo]",
		"- item\n  > [!note]",
		"- item\n  > [!dm]\n  > one\n  two",
		"- item\nlazy list continuation\n  > [!dm]\n  > SECRET\npublic-looking lazy continuation",
		"> - item\n>   > [!dm]\n>   > SECRET\npublic-looking lazy continuation",
		"- [!dm]",
		"1234567890. > [!dm]",
		"- > [!dm:]",
		"- item\n\nPublic paragraph\n  > [!dm]",
		"- item\n# New heading\n  > [!dm]",
		"- item\n---\n  > [!dm]",
		"- item\n```\n  > [!dm]",
	} {
		for _, record := range AuditBody(body) {
			if record.Kind == BodySpanKind("LIST_NESTED") {
				t.Errorf("non-list or unaccepted marker %q produced list warning %+v", body, record)
			}
		}
	}
	for _, body := range []string{"```\n- > [!dm]\n```", "- > \\[!dm]"} {
		found := false
		for _, record := range AuditBody(body) {
			found = found || record.Kind == BodySpanKind("LIST_NESTED")
		}
		if !found {
			t.Errorf("raw-lexer list marker %q lost its diagnostic", body)
		}
	}
}

// Every shared fixture span that is hidden or special must appear in the audit
// with its kind, handle and exact source lines; public spans never appear.
func TestAuditBodyMapsSharedFixtureSpans(t *testing.T) {
	fixture := sharedMarkerFixtures(t)
	for _, tc := range fixture.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			lines := strings.Split(tc.Body, "\n")
			var spans []BodySpanAudit
			var lookalikes []BodySpanAudit
			for _, record := range AuditBody(tc.Body) {
				if record.StartLine < 1 || record.EndLine < record.StartLine || record.EndLine > len(lines) {
					t.Fatalf("record %+v outside %d source lines", record, len(lines))
				}
				checkTokenRange(t, lines, record)
				if record.Kind == BodySpanLookalike {
					lookalikes = append(lookalikes, record)
				} else if record.Kind != BodySpanKind("LIST_NESTED") {
					spans = append(spans, record)
				}
			}
			var want []bodySpan
			for _, span := range tc.Spans {
				if span.Policy != nil || span.Spoiler {
					want = append(want, span)
				}
			}
			if len(spans) != len(want) {
				t.Fatalf("audit spans=%+v want fixture spans %+v", spans, want)
			}
			for i, span := range want {
				got := spans[i]
				if text := strings.Join(lines[got.StartLine-1:got.EndLine], "\n"); text != span.Text {
					t.Fatalf("lines %d-%d hold %q, want %q", got.StartLine, got.EndLine, text, span.Text)
				}
				var kind BodySpanKind
				var handle *string
				switch {
				case span.Spoiler:
					kind = BodySpanSpoiler
				case len(span.Policy) == 0:
					kind = BodySpanMalformed
				case span.Policy[0] == "role:dm":
					kind = BodySpanDM
				default:
					kind = BodySpanMember
					handle = auditText(strings.TrimPrefix(span.Policy[0], "member:@"))
				}
				if got.Kind != kind || !reflect.DeepEqual(got.Handle, handle) {
					t.Fatalf("record %+v want kind %s handle %v", got, kind, handle)
				}
			}
			wantLookalike := tc.Name == "ordinary unknown '[!dmdun]'"
			if (len(lookalikes) == 1) != wantLookalike || len(lookalikes) > 1 {
				t.Fatalf("lookalikes=%+v want lookalike=%v", lookalikes, wantLookalike)
			}
		})
	}
}

func TestAuditBodyReportsLookalikesSuggestionsAndLines(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
		want []BodySpanAudit
	}{
		{name: "empty body", body: "", want: []BodySpanAudit{}},
		{name: "public prose and ordinary callout", body: "Intro\n> [!note]\n> Visible", want: []BodySpanAudit{}},
		{name: "bare marker scopes its own line", body: "Intro\nBare [!dm] secret\nAfter", want: []BodySpanAudit{
			{StartLine: 2, EndLine: 2, Kind: BodySpanDM},
		}},
		{name: "blockquote run is one span", body: "Intro\n\n> [!dm:@Mortal]\n> one\n> two\n\nAfter", want: []BodySpanAudit{
			{StartLine: 3, EndLine: 5, Kind: BodySpanMember, Handle: auditText("Mortal")},
		}},
		{name: "spoiler span", body: "> [!spoiler]\n> twist", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanSpoiler},
		}},
		{name: "missing colon leaks", body: "Intro\n> [!dm@mortal]\n> secret", want: []BodySpanAudit{
			{StartLine: 2, EndLine: 3, Kind: BodySpanLookalike, Suggestion: auditText("[!dm:@mortal]")},
		}},
		{name: "bare missing colon leaks its line", body: "[!DM@Mortal] secret\nAfter", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 1, Kind: BodySpanLookalike, Suggestion: auditText("[!dm:@Mortal]")},
		}},
		{name: "glued name has no safe suggestion", body: "> [!dmdun]\n> secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanLookalike},
		}},
		{name: "plural spoiler", body: "> [!spoilers]\n> twist", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanLookalike, Suggestion: auditText("[!spoiler]")},
		}},
		{name: "unclosed spoiler", body: "[!Spoiler twist", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 1, Kind: BodySpanLookalike, Suggestion: auditText("[!spoiler]")},
		}},
		{name: "two lookalikes in one run", body: "> [!dm@a]\n> [!spoilerz]", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanLookalike, Suggestion: auditText("[!dm:@a]")},
			{StartLine: 1, EndLine: 2, Kind: BodySpanLookalike, Suggestion: auditText("[!spoiler]")},
		}},
		{name: "lookalike inside visible spoiler run", body: "> [!spoiler]\n> [!dm @x] secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanSpoiler},
			{StartLine: 1, EndLine: 2, Kind: BodySpanLookalike, Suggestion: auditText("[!dm:@x]")},
		}},
		{name: "lookalike inside hidden run is not a leak", body: "> [!dm]\n> [!dmx] secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanDM},
		}},
		{name: "space after colon is malformed with fix", body: "> [!dm: @x]\n> secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanMalformed, Suggestion: auditText("[!dm:@x]")},
		}},
		{name: "missing at sign is malformed with fix", body: "[!DM:x] secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 1, Kind: BodySpanMalformed, Suggestion: auditText("[!dm:@x]")},
		}},
		{name: "unclosed dm with handle keeps it", body: "> [!dm:@mortal secret words\n> more", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanMalformed, Suggestion: auditText("[!dm:@mortal]")},
		}},
		{name: "empty handle is malformed with dm fix", body: "> [!dm:]\n> secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanMalformed, Suggestion: auditText("[!dm]")},
		}},
		{name: "unsupported handle charset has no fix", body: "> [!dm:@Space Handle]\n> secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanMalformed},
		}},
		{name: "audience grammar has no fix", body: "> [!audience role:player]\n> secret", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 2, Kind: BodySpanMalformed},
		}},
		{name: "spans keep source order", body: "[!dm] a\nplain\n> [!dm:@x]\n> b\n\n[!spoiler] c\n> [!dm@y]", want: []BodySpanAudit{
			{StartLine: 1, EndLine: 1, Kind: BodySpanDM},
			{StartLine: 3, EndLine: 4, Kind: BodySpanMember, Handle: auditText("x")},
			{StartLine: 6, EndLine: 6, Kind: BodySpanSpoiler},
			{StartLine: 7, EndLine: 7, Kind: BodySpanLookalike, Suggestion: auditText("[!dm:@y]")},
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := AuditBody(tc.body)
			lines := strings.Split(tc.body, "\n")
			for i := range got {
				checkTokenRange(t, lines, got[i])
				got[i].Token, got[i].TokenLine, got[i].TokenColumn = nil, nil, nil
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("audit=%s\nwant=%s", describeAudit(got), describeAudit(tc.want))
			}
		})
	}
}

func describeAudit(records []BodySpanAudit) string {
	if records == nil {
		return "nil"
	}
	out := make([]string, 0, len(records))
	for _, r := range records {
		handle, suggestion := "<nil>", "<nil>"
		if r.Handle != nil {
			handle = *r.Handle
		}
		if r.Suggestion != nil {
			suggestion = *r.Suggestion
		}
		out = append(out, fmt.Sprintf("%s %d-%d handle=%s suggestion=%s", r.Kind, r.StartLine, r.EndLine, handle, suggestion))
	}
	return "[" + strings.Join(out, ", ") + "]"
}

func TestAuditBodyQuerySharesPreviewAdmissionAndBound(t *testing.T) {
	db := previewNoDB{}
	repo, err := NewProductPostgres(db)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(db)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	queries, err := NewProductQueries(ProductReadRepos{Document: repo, Batch: repo}, policy, time.Now, observer)
	if err != nil {
		t.Fatal(err)
	}
	player, err := auth.NewAuthorityWithHandle("10000000-0000-4000-8000-000000000001", []auth.Role{auth.Player}, "active", "", "Current")
	if err != nil {
		t.Fatal(err)
	}
	got, err := queries.AuditBody(t.Context(), player, "> [!dm@mortal]\n> secret")
	if err != nil || len(got) != 1 || got[0].Kind != BodySpanLookalike {
		t.Fatalf("player audit=%s err=%v", describeAudit(got), err)
	}
	for _, tc := range []struct {
		name  string
		actor auth.Authority
		body  string
		code  apierr.Code
	}{
		{name: "guest denied", body: "[!dm] x", code: apierr.Forbidden},
		{name: "oversized body", actor: player, body: strings.Repeat("x", 128*1024+1), code: apierr.Invalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := queries.AuditBody(t.Context(), tc.actor, tc.body)
			if failure, ok := errors.AsType[*apierr.Error](err); !ok || failure.Code != tc.code || got != nil {
				t.Fatalf("audit=%v err=%v, want %s", got, err, tc.code)
			}
		})
	}
}

// checkTokenRange proves Token sits at TokenLine/TokenColumn (UTF-16 units)
// inside the record's span, as a browser editor would address it.
func checkTokenRange(t *testing.T, lines []string, r BodySpanAudit) {
	t.Helper()
	if r.Token == nil || r.TokenLine == nil || r.TokenColumn == nil {
		t.Fatalf("record %s has no token position", describeAudit([]BodySpanAudit{r}))
	}
	if *r.TokenLine < r.StartLine || *r.TokenLine > r.EndLine {
		t.Fatalf("token line %d outside span %d-%d", *r.TokenLine, r.StartLine, r.EndLine)
	}
	units := utf16.Encode([]rune(lines[*r.TokenLine-1]))
	start := *r.TokenColumn - 1
	token := utf16.Encode([]rune(*r.Token))
	if start < 0 || start+len(token) > len(units) || string(utf16.Decode(units[start:start+len(token)])) != *r.Token {
		t.Fatalf("line %d column %d does not hold token %q", *r.TokenLine, *r.TokenColumn, *r.Token)
	}
}

func TestAuditBodyTokenPositionsUseUTF16Columns(t *testing.T) {
	type position struct {
		kind   BodySpanKind
		token  string
		line   int
		column int
	}
	for _, tc := range []struct {
		name string
		body string
		want []position
	}{
		{name: "bare marker mid-line", body: "Intro\nBare [!DM] secret", want: []position{{BodySpanDM, "[!DM]", 2, 6}}},
		{name: "quoted marker on later run line", body: "> lead\n>  [!dm:@Mortal]\n> secret", want: []position{{BodySpanMember, "[!dm:@Mortal]", 2, 4}}},
		{name: "member token skips earlier dm token", body: "> [!dm]\n> [!dm:@x]", want: []position{{BodySpanMember, "[!dm:@x]", 2, 3}}},
		{name: "spoiler token", body: "> [!spoiler]\n> twist", want: []position{{BodySpanSpoiler, "[!spoiler]", 1, 3}}},
		{name: "non-ASCII before lookalike", body: "Café 🐉 [!dm@mortal] secret", want: []position{{BodySpanLookalike, "[!dm@mortal]", 1, 9}}},
		{name: "non-ASCII before quoted malformed", body: "> ok\n> ½ é [!dm: @x] secret", want: []position{{BodySpanMalformed, "[!dm: @x]", 2, 7}}},
		{name: "malformed token is the offending one", body: "> [!dm:@x]\n> [!dm:]", want: []position{{BodySpanMalformed, "[!dm:]", 2, 3}}},
		{name: "unclosed token stops before prose", body: "> [!Dm: rest\n> secret", want: []position{{BodySpanMalformed, "[!Dm:", 1, 3}}},
		{name: "unclosed spoiler token keeps prose", body: "é [! Spoiler Big twist here", want: []position{{BodySpanLookalike, "[! Spoiler", 1, 3}}},
		{name: "unclosed dm handle token keeps prose", body: "> [!dm:@mortal secret words\n> more", want: []position{{BodySpanMalformed, "[!dm:@mortal", 1, 3}}},
		{name: "two lookalikes on one line", body: "🐉[!dm@a] [!spoilers]", want: []position{{BodySpanLookalike, "[!dm@a]", 1, 3}, {BodySpanLookalike, "[!spoilers]", 1, 11}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := AuditBody(tc.body)
			lines := strings.Split(tc.body, "\n")
			var positions []position
			for _, r := range got {
				checkTokenRange(t, lines, r)
				positions = append(positions, position{r.Kind, *r.Token, *r.TokenLine, *r.TokenColumn})
			}
			if !reflect.DeepEqual(positions, tc.want) {
				t.Fatalf("positions=%+v want=%+v", positions, tc.want)
			}
		})
	}
}

// Replacing Token with Suggestion must never delete the author's prose.
func TestAuditBodySuggestionReplacementKeepsProse(t *testing.T) {
	for _, tc := range []struct{ body, want string }{
		{"[!Spoiler Big twist here", "[!spoiler] Big twist here"},
		{"> [!dm:@mortal secret words", "> [!dm:@mortal] secret words"},
		{"> [!Dm: rest", "> [!dm] rest"},
		{"Café [!dm@mortal] secret", "Café [!dm:@mortal] secret"},
	} {
		records := AuditBody(tc.body)
		if len(records) != 1 || records[0].Suggestion == nil {
			t.Fatalf("%q audit=%s", tc.body, describeAudit(records))
		}
		r := records[0]
		units := utf16.Encode([]rune(tc.body))
		start := *r.TokenColumn - 1
		end := start + len(utf16.Encode([]rune(*r.Token)))
		fixed := string(utf16.Decode(units[:start])) + *r.Suggestion + string(utf16.Decode(units[end:]))
		if fixed != tc.want {
			t.Fatalf("%q fixed to %q, want %q", tc.body, fixed, tc.want)
		}
	}
}

// Columns advance once per line, so a maximal single-line body stays linear.
func TestAuditBodyTokenColumnsStayLinear(t *testing.T) {
	line := strings.Repeat("é[!dmx]", 128*1024/len("é[!dmx]"))
	started := time.Now()
	records := AuditBody(line)
	elapsed := time.Since(started)
	if len(records) != 128*1024/len("é[!dmx]") {
		t.Fatalf("records=%d", len(records))
	}
	last := records[len(records)-1]
	if want := (len(records)-1)*7 + 2; *last.TokenColumn != want {
		t.Fatalf("last column=%d want %d", *last.TokenColumn, want)
	}
	if elapsed > 500*time.Millisecond {
		t.Fatalf("128 KiB single-line audit took %s", elapsed)
	}
	plain := strings.Repeat("[!x]", 128*1024/4)
	started = time.Now()
	if records := AuditBody(plain); len(records) != 0 {
		t.Fatalf("plain callouts reported %d records", len(records))
	}
	if elapsed := time.Since(started); elapsed > 500*time.Millisecond {
		t.Fatalf("128 KiB single-line [!x] audit took %s", elapsed)
	}
}
