package document

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func TestMapRecentDiscoveryGroupsNullCategoryAndCapsBuckets(t *testing.T) {
	idA := db.MustUUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	idB := db.MustUUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	idC := db.MustUUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
	author := db.MustUUID("11111111-1111-1111-1111-111111111111")
	updated := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	row := func(id pgtype.UUID, category pgtype.Text, rank int64) dbgen.DocumentRecentDiscoveryRow {
		return dbgen.DocumentRecentDiscoveryRow{
			ID: id, Kind: "codex_entry", Slug: db.UUIDString(id), Title: db.UUIDString(id),
			Category: category, Status: "published", Visibility: "public", Body: "body",
			AuthorID: author, UpdatedAt: pgtype.Timestamptz{Time: updated, Valid: true},
			Version: 1, DocRank: rank, BucketUpdatedAt: pgtype.Timestamptz{Time: updated, Valid: true},
		}
	}
	buckets, err := mapRecentDiscovery(t.Context(), ViewerScope{Anonymous: true}, []dbgen.DocumentRecentDiscoveryRow{
		row(idA, pgtype.Text{}, 1),
		row(idB, pgtype.Text{}, 2),
		row(idC, pgtype.Text{String: "lore", Valid: true}, 1),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(buckets) != 2 {
		t.Fatalf("buckets=%d want 2", len(buckets))
	}
	if buckets[0].Category != nil {
		t.Fatalf("null category bucket got %v", buckets[0].Category)
	}
	if len(buckets[0].Documents) != 2 {
		t.Fatalf("null bucket docs=%d", len(buckets[0].Documents))
	}
	if buckets[1].Category == nil || *buckets[1].Category != "lore" {
		t.Fatalf("lore bucket=%+v", buckets[1])
	}
}

func TestTruncateCodepoints(t *testing.T) {
	if got := truncateCodepoints("abcdef", 3); got != "abc" {
		t.Fatalf("got %q", got)
	}
	if got := truncateCodepoints("日本語です", 2); got != "日本" {
		t.Fatalf("got %q", got)
	}
}

func TestDocumentDiscoveryKinds(t *testing.T) {
	if got := documentDiscoveryKinds(nil); len(got) != 0 {
		t.Fatalf("nil kinds=%v", got)
	}
	if got := documentDiscoveryKinds([]string{"member", "codex_entry"}); len(got) != 1 || got[0] != "codex_entry" {
		t.Fatalf("filtered=%v", got)
	}
	if got := documentDiscoveryKinds([]string{"member"}); len(got) != 1 || got[0] != "__none__" {
		t.Fatalf("member-only=%v", got)
	}
}
