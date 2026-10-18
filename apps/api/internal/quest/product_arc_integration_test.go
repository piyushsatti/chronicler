//go:build integration

package quest

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func seedQuestArcDM(t *testing.T, ctx context.Context, fixture *dbtest.ProductFixture) string {
	t.Helper()
	dmID := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `
		INSERT INTO members(public_id,discord_id,handle,display_name,roles)
		VALUES ($1,$2,$3,$3,ARRAY['dm'])`, dmID, "arc-dm-"+dmID[:8], "arc-dm"); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `
		INSERT INTO dm_profiles(member_id,status)
		SELECT id,'approved' FROM members WHERE public_id=$1::uuid`, dmID); err != nil {
		t.Fatal(err)
	}
	return dmID
}

func newQuestCommandHarness(t *testing.T, fixture *dbtest.ProductFixture) (*ProductCommands, *member.PostgresStore) {
	t.Helper()
	ctx := context.Background()
	policy, err := auth.NewPoolPolicy(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	memberStore, err := member.NewFromDBTX(fixture.Pool, "")
	if err != nil {
		t.Fatal(err)
	}
	runner := db.NewRunner(fixture.Pool, func(tx pgx.Tx) ProductCommandRepos {
		pg, err := NewProductPostgres(tx)
		if err != nil {
			t.Fatal(err)
		}
		replay, err := idempotency.NewRepository(tx)
		if err != nil {
			t.Fatal(err)
		}
		audit, err := auth.NewOverrideRecorder(tx)
		if err != nil {
			t.Fatal(err)
		}
		txStore, err := member.NewFromDBTX(tx, "")
		if err != nil {
			t.Fatal(err)
		}
		return ProductCommandRepos{
			Arc:       pg,
			Quest:     pg,
			Policy:    policy,
			Authority: txStore.ResolveAuthority,
			Replay:    replay,
			Audit:     audit,
		}
	})
	commands, err := NewProductCommands(runner, time.Now, func() string { return uuid.NewString() })
	if err != nil {
		t.Fatal(err)
	}
	pg, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	queries, err := NewProductQueries(ProductReadRepos{Arc: pg, Quest: pg, Batch: pg}, policy, time.Now, observer)
	if err != nil {
		t.Fatal(err)
	}
	commands.Queries = queries
	_ = ctx
	return commands, memberStore
}

func TestProductQuestArcListUsesSQLTotal(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	dmID := seedQuestArcDM(t, ctx, fixture)
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Forest arc", "River arc"} {
		if _, err := fixture.Pool.Exec(ctx, `
			INSERT INTO quest_arcs(name, created_by, created_at)
			SELECT $1, m.id, now() FROM members m WHERE m.public_id=$2::uuid`, name, dmID); err != nil {
			t.Fatal(err)
		}
	}
	actor, err := auth.NewAuthority(dmID, []auth.Role{auth.DM}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	page, err := adapter.ReadQuestArcs(ctx, actor, QuestArcsSpec{Limit: 1, Offset: 0})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 {
		t.Fatalf("total = %d, want 2", page.Total)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items len = %d, want 1", len(page.Items))
	}
}

func TestUpsertQuestArcReplayAndConflict(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	dmID := seedQuestArcDM(t, ctx, fixture)
	commands, memberStore := newQuestCommandHarness(t, fixture)
	actor, err := memberStore.ResolveAuthority(ctx, dmID)
	if err != nil {
		t.Fatal(err)
	}
	spec := UpsertQuestArcSpec{Name: "Forest arc"}
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	first, err := commands.UpsertQuestArc(ctx, actor, spec, meta)
	if err != nil {
		t.Fatal(err)
	}
	if first.Name != "Forest arc" || first.Id == "" {
		t.Fatalf("first arc = %+v", first)
	}
	var count int
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM quest_arcs`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("quest_arcs count = %d, want 1", count)
	}
	replayed, err := commands.UpsertQuestArc(ctx, actor, spec, meta)
	if err != nil {
		t.Fatal(err)
	}
	if replayed.Id != first.Id || replayed.Name != first.Name || replayed.CreatedBy != first.CreatedBy {
		t.Fatalf("replay = %+v, want id/name/author match to %+v", replayed, first)
	}
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM quest_arcs`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("after replay quest_arcs count = %d, want 1", count)
	}
	conflictSpec := UpsertQuestArcSpec{Name: "River arc II"}
	_, err = commands.UpsertQuestArc(ctx, actor, conflictSpec, meta)
	var expected *apierr.Error
	if !errors.As(err, &expected) || expected.Code != apierr.Conflict {
		t.Fatalf("conflict err = %v, want CONFLICT", err)
	}
	stored, err := commands.Queries.QuestArc(ctx, actor, QuestArcSpec{Id: first.Id})
	if err != nil || stored == nil || stored.Name != "Forest arc" {
		t.Fatalf("stored arc = %+v err=%v", stored, err)
	}
}
