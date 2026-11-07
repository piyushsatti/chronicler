//go:build integration

package integration_test

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/db/migrations"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func TestDmTableHouseRulesAppend(t *testing.T) {
	ctx := context.Background()
	pool := integrationPool(t)
	up := dmTableHouseRulesUpSQL(t)

	existingRules := "Be kind."
	existingTitle := "Friday"
	existingBody := "Bring dice."
	existingWant := existingRules + "\n\n## From my DM table: " + existingTitle + "\n" + existingBody
	existing := insertDmTable(t, pool, &existingRules, existingTitle, existingBody, "published", "public")

	emptyTitle := "界"
	emptyHeading := "## From my DM table: " + emptyTitle
	emptyBody := strings.Repeat("界", 4000-utf8.RuneCountInString(emptyHeading)-1)
	emptyWant := emptyHeading + "\n" + emptyBody
	if utf8.RuneCountInString(emptyWant) != 4000 || len(emptyWant) <= 4000 {
		t.Fatalf("empty fixture must be 4000 characters and more than 4000 bytes, runes=%d bytes=%d", utf8.RuneCountInString(emptyWant), len(emptyWant))
	}
	empty := insertDmTable(t, pool, nil, emptyTitle, emptyBody, "published", "public")

	overflowRules := strings.Repeat("a", 4000)
	overflow := insertDmTable(t, pool, &overflowRules, "Full", "one more", "published", "public")

	draftRules := "Draft rules."
	draft := insertDmTable(t, pool, &draftRules, "Draft", "Not published.", "draft", "public")
	dmOnlyRules := "Hidden rules."
	dmOnly := insertDmTable(t, pool, &dmOnlyRules, "Secret", "DMs only.", "published", "dm_only")
	markedRules := "Marked rules."
	markedBody := "Visible\n> [!dm]\n> secret"
	marked := insertDmTable(t, pool, &markedRules, "Marked", markedBody, "published", "public")

	beforeDocs := map[int64]string{
		existing.docID: existingBody,
		empty.docID:    emptyBody,
		overflow.docID: "one more",
		draft.docID:    "Not published.",
		dmOnly.docID:   "DMs only.",
		marked.docID:   markedBody,
	}

	execDmTableHouseRulesUp(t, pool, up)
	assertHouseRules(t, pool, existing.memberID, existingWant)
	assertHouseRules(t, pool, empty.memberID, emptyWant)
	assertHouseRules(t, pool, overflow.memberID, overflowRules)
	assertHouseRules(t, pool, draft.memberID, draftRules)
	assertHouseRules(t, pool, dmOnly.memberID, dmOnlyRules)
	assertHouseRules(t, pool, marked.memberID, markedRules)
	assertReviewRevision(t, pool, existing.memberID, 1)
	assertReviewRevision(t, pool, empty.memberID, 1)
	assertReviewRevision(t, pool, overflow.memberID, 0)
	assertReviewRevision(t, pool, draft.memberID, 0)
	assertReviewRevision(t, pool, dmOnly.memberID, 0)
	assertReviewRevision(t, pool, marked.memberID, 0)
	var emptyChars, emptyBytes int
	if err := pool.QueryRow(ctx, `SELECT char_length(house_rules), octet_length(house_rules) FROM dm_profiles WHERE member_id=$1`, empty.memberID).Scan(&emptyChars, &emptyBytes); err != nil {
		t.Fatal(err)
	}
	if emptyChars != 4000 || emptyBytes <= 4000 {
		t.Fatalf("stored empty append chars=%d bytes=%d", emptyChars, emptyBytes)
	}
	assertDocumentsUnchanged(t, pool, beforeDocs)

	execDmTableHouseRulesUp(t, pool, up)
	assertHouseRules(t, pool, existing.memberID, existingWant)
	assertHouseRules(t, pool, empty.memberID, emptyWant)
	assertHouseRules(t, pool, overflow.memberID, overflowRules)
	assertHouseRules(t, pool, draft.memberID, draftRules)
	assertHouseRules(t, pool, dmOnly.memberID, dmOnlyRules)
	assertHouseRules(t, pool, marked.memberID, markedRules)
	assertReviewRevision(t, pool, existing.memberID, 1)
	assertReviewRevision(t, pool, empty.memberID, 1)
	assertDocumentsUnchanged(t, pool, beforeDocs)
}

func dmTableHouseRulesUpSQL(t *testing.T) string {
	t.Helper()
	raw, err := migrations.FS.ReadFile("0018_dm_table_house_rules.sql")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	const upMark = "-- +goose Up\n"
	const downMark = "-- +goose Down"
	start := strings.Index(text, upMark)
	end := strings.Index(text, downMark)
	if start < 0 || end < start {
		t.Fatal("migration is missing goose Up/Down markers")
	}
	return text[start+len(upMark) : end]
}

func execDmTableHouseRulesUp(t *testing.T, pool *db.Pool, up string) {
	t.Helper()
	ctx := context.Background()
	const begin = "-- +goose StatementBegin"
	const end = "-- +goose StatementEnd"
	if !strings.Contains(up, "RAISE WARNING") {
		t.Fatal("migration must warn once per skipped dm table")
	}
	for _, part := range strings.Split(up, begin) {
		stmt := strings.TrimSpace(strings.ReplaceAll(part, end, ""))
		if stmt == "" {
			continue
		}
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatal(err)
		}
	}
}

type dmTableFixture struct {
	memberID int64
	docID    int64
}

func insertDmTable(t *testing.T, pool *db.Pool, rules *string, title, body, status, visibility string) dmTableFixture {
	t.Helper()
	ctx := context.Background()
	token := strings.ReplaceAll(uuid.NewString(), "-", "")
	got := &dmTableFixture{}
	t.Cleanup(func() {
		bg := context.Background()
		if got.docID != 0 {
			if _, err := pool.Exec(bg, `DELETE FROM documents WHERE id=$1`, got.docID); err != nil {
				t.Errorf("delete document: %v", err)
			}
		}
		if got.memberID != 0 {
			if _, err := pool.Exec(bg, `DELETE FROM members WHERE id=$1`, got.memberID); err != nil {
				t.Errorf("delete member: %v", err)
			}
		}
	})
	if err := pool.QueryRow(ctx, `
		INSERT INTO members (discord_id, handle, display_name, roles)
		VALUES ($1, $2, $3, ARRAY['dm']::text[])
		RETURNING id`,
		"dmtable-"+token, "h"+token[:20], "DM "+token[:8],
	).Scan(&got.memberID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO dm_profiles (member_id, house_rules) VALUES ($1, $2)`, got.memberID, rules); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO documents (kind, category, slug, title, body, author_id, status, visibility)
		VALUES ('community', 'dm_table', $1, $2, $3, $4, $5, $6)
		RETURNING id`,
		"dm-table-"+token, title, body, got.memberID, status, visibility,
	).Scan(&got.docID); err != nil {
		t.Fatal(err)
	}
	return *got
}

func assertHouseRules(t *testing.T, pool *db.Pool, memberID int64, want string) {
	t.Helper()
	var got string
	if err := pool.QueryRow(context.Background(), `SELECT house_rules FROM dm_profiles WHERE member_id=$1`, memberID).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("house_rules=%q want %q", got, want)
	}
}

func assertReviewRevision(t *testing.T, pool *db.Pool, memberID int64, want int32) {
	t.Helper()
	var got int32
	if err := pool.QueryRow(context.Background(), `SELECT review_revision FROM dm_profiles WHERE member_id=$1`, memberID).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("review_revision=%d want %d", got, want)
	}
}

func assertDocumentsUnchanged(t *testing.T, pool *db.Pool, bodies map[int64]string) {
	t.Helper()
	for id, body := range bodies {
		var got string
		var live bool
		if err := pool.QueryRow(context.Background(), `SELECT body, deleted_at IS NULL FROM documents WHERE id=$1`, id).Scan(&got, &live); err != nil {
			t.Fatal(err)
		}
		if got != body || !live {
			t.Fatalf("document %d body=%q live=%t", id, got, live)
		}
	}
}
