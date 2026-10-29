//go:build integration

package member

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPrivateNotesPersistPerMemberInSettingsPayload(t *testing.T) {
	ctx := context.Background()
	fixture := dbtest.NewProductFixture(t)
	const writer = "10000000-0000-4000-8000-0000000000a1"
	const other = "10000000-0000-4000-8000-0000000000a2"
	for _, row := range []struct{ id, discord, handle string }{{writer, "notes-writer", "notes-writer"}, {other, "notes-other", "notes-other"}} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$3,$3,ARRAY['player'])`, row.id, row.discord, row.handle); err != nil {
			t.Fatal(err)
		}
	}
	// A pre-existing payload key must survive notes writes.
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO member_settings(member_id,payload) SELECT id,'{"pronouns":"they/them"}'::jsonb FROM members WHERE public_id=$1`, writer); err != nil {
		t.Fatal(err)
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	writerAuthority, err := auth.NewAuthority(writer, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	otherAuthority, err := auth.NewAuthority(other, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}

	empty, err := adapter.ReadMyPrivateNotes(ctx, writerAuthority, MyPrivateNotesSpec{})
	if err != nil || empty.Body != "" || empty.UpdatedAt != nil {
		t.Fatalf("initial notes=%+v err=%v", empty, err)
	}
	at := time.Date(2026, 10, 22, 4, 0, 0, 0, time.UTC)
	stored, err := adapter.StoreSetMyPrivateNotes(ctx, SetMyPrivateNotesWrite{ActorID: writer, At: at, Body: "# Secrets\n\nThe innkeeper lies."})
	if err != nil || stored.Body != "# Secrets\n\nThe innkeeper lies." || stored.UpdatedAt == nil || !stored.UpdatedAt.Equal(at) {
		t.Fatalf("stored notes=%+v err=%v", stored, err)
	}
	// Another member sees only their own (empty) notes; there is no way to address the writer's.
	foreign, err := adapter.ReadMyPrivateNotes(ctx, otherAuthority, MyPrivateNotesSpec{})
	if err != nil || foreign.Body != "" || foreign.UpdatedAt != nil {
		t.Fatalf("other member notes=%+v err=%v", foreign, err)
	}
	// A first notes write for a member without a settings row creates one with default settings.
	if _, err := adapter.StoreSetMyPrivateNotes(ctx, SetMyPrivateNotesWrite{ActorID: other, At: at, Body: "mine"}); err != nil {
		t.Fatal(err)
	}

	// Settings writes keep the notes, and notes writes keep the settings and other payload keys.
	effectsOff := false
	patch := UpdateMySettingsSpec{Input: MemberSettingsPatch{EffectsEnabled: product.Optional[bool]{Set: true, Value: &effectsOff}}}
	state, err := adapter.LockUpdateMySettings(ctx, writer, UpdateMySettingsSpec{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adapter.StoreUpdateMySettings(ctx, UpdateMySettingsWrite{ActorID: writer, At: at.Add(time.Minute), Input: patch, ValidatedInput: patch, Locked: state}); err != nil {
		t.Fatal(err)
	}
	later := at.Add(2 * time.Minute)
	if _, err := adapter.StoreSetMyPrivateNotes(ctx, SetMyPrivateNotesWrite{ActorID: writer, At: later, Body: "revised"}); err != nil {
		t.Fatal(err)
	}
	reread, err := adapter.ReadMyPrivateNotes(ctx, writerAuthority, MyPrivateNotesSpec{})
	if err != nil || reread.Body != "revised" || reread.UpdatedAt == nil || !reread.UpdatedAt.Equal(later) {
		t.Fatalf("reread notes=%+v err=%v", reread, err)
	}
	var pronouns string
	var effects bool
	if err := fixture.Pool.QueryRow(ctx, `SELECT s.payload->>'pronouns',s.effects_enabled FROM member_settings s JOIN members m ON m.id=s.member_id WHERE m.public_id=$1`, writer).Scan(&pronouns, &effects); err != nil {
		t.Fatal(err)
	}
	if pronouns != "they/them" || effects {
		t.Fatalf("payload pronouns=%q effects=%t", pronouns, effects)
	}
	personalization, err := adapter.ReadMyPersonalization(ctx, writerAuthority, MyPersonalizationSpec{})
	if err != nil || personalization == nil || personalization.Settings == nil || personalization.Settings.EffectsEnabled {
		t.Fatalf("personalization=%+v err=%v", personalization, err)
	}
}

// The command result doubles as the idempotency receipt, which is never purged,
// so the saved body must not be copied into idempotency_keys.
func TestSetMyPrivateNotesReceiptOmitsBody(t *testing.T) {
	ctx := context.Background()
	fixture := dbtest.NewProductFixture(t)
	const writer = "10000000-0000-4000-8000-0000000000b1"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,'receipt-writer','receipt-writer','receipt-writer',ARRAY['player'])`, writer); err != nil {
		t.Fatal(err)
	}
	runner := db.NewRunner(fixture.Pool, func(tx pgx.Tx) ProductCommandRepos {
		pg, _ := NewProductPostgres(tx)
		policy, _ := auth.NewPoolPolicy(tx)
		replay, _ := idempotency.NewRepository(tx)
		store, _ := NewFromDBTX(tx, "")
		return ProductCommandRepos{Member: pg, Reference: pg, Policy: policy, Authority: store.ResolveAuthority, Replay: replay, Producer: notification.NewProducer()}
	})
	at := time.Date(2026, 10, 22, 5, 0, 0, 0, time.UTC)
	commands, err := NewProductCommands(runner, func() time.Time { return at }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := auth.NewAuthority(writer, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	const body = "receipt-canary: the innkeeper is the lich"
	meta := product.CommandMeta{IdempotencyKey: "notes-receipt-1"}
	first, err := commands.SetMyPrivateNotes(ctx, actor, SetMyPrivateNotesSpec{Body: body}, meta)
	if err != nil || first.UpdatedAt == nil || !first.UpdatedAt.Equal(at) {
		t.Fatalf("set notes=%+v err=%v", first, err)
	}
	replayed, err := commands.SetMyPrivateNotes(ctx, actor, SetMyPrivateNotesSpec{Body: body}, meta)
	if err != nil || replayed.UpdatedAt == nil || !replayed.UpdatedAt.Equal(at) {
		t.Fatalf("replayed notes=%+v err=%v", replayed, err)
	}
	var receipts, leaking int
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE receipt::text LIKE '%receipt-canary%') FROM idempotency_keys WHERE endpoint='graphql:setMyPrivateNotes'`).Scan(&receipts, &leaking); err != nil {
		t.Fatal(err)
	}
	if receipts != 1 || leaking != 0 {
		t.Fatalf("setMyPrivateNotes receipts=%d, receipts containing the body=%d", receipts, leaking)
	}
}
