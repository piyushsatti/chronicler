//go:build integration

package integration_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

const (
	seedPlayer = "33333333-3333-4333-8333-333333333333"
)

func TestSignUpAtomicAndOwnership(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	questID, _ := insertOpenQuest(t, pool)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	ownChar := insertCharacter(t, pool, "own-"+suffix, seedPlayer)
	otherChar := insertCharacter(t, pool, "oth-"+suffix, seedDM)

	cmd := quest.NewCommands(db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	}), time.Now)
	actor := auth.Claims{MemberID: seedPlayer}

	if err := cmd.SignUp(ctx, actor, questID, otherChar); !errors.Is(err, quest.ErrNotCharacterOwner) {
		t.Fatalf("want ErrNotCharacterOwner got %v", err)
	}

	if err := cmd.SignUp(ctx, actor, questID, ownChar); err != nil {
		t.Fatalf("first signup: %v", err)
	}
	var filled int
	var desired int
	if err := pool.QueryRow(ctx, `
		SELECT filled_count, discord_desired_revision FROM quests WHERE public_id = $1`, questID,
	).Scan(&filled, &desired); err != nil {
		t.Fatal(err)
	}
	if filled != 1 || desired != 1 {
		t.Fatalf("after first signup filled=%d desired=%d", filled, desired)
	}

	if err := cmd.SignUp(ctx, actor, questID, ownChar); !errors.Is(err, quest.ErrAlreadySignedUp) {
		t.Fatalf("want ErrAlreadySignedUp got %v", err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT filled_count, discord_desired_revision FROM quests WHERE public_id = $1`, questID,
	).Scan(&filled, &desired); err != nil {
		t.Fatal(err)
	}
	if filled != 1 || desired != 1 {
		t.Fatalf("duplicate must not bump filled/desired; filled=%d desired=%d", filled, desired)
	}
}

func TestSignUpMarksFull(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	questID, _ := insertOpenQuest(t, pool)
	_, err := pool.Exec(ctx, `UPDATE quests SET slots_max = 1, filled_count = 0 WHERE public_id = $1`, questID)
	if err != nil {
		t.Fatal(err)
	}
	ownChar := insertCharacter(t, pool, fmt.Sprintf("full-%d", time.Now().UnixNano()), seedPlayer)
	cmd := quest.NewCommands(db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	}), time.Now)
	if err := cmd.SignUp(ctx, auth.Claims{MemberID: seedPlayer}, questID, ownChar); err != nil {
		t.Fatal(err)
	}
	var status string
	var filled int
	if err := pool.QueryRow(ctx, `SELECT status, filled_count FROM quests WHERE public_id = $1`, questID).Scan(&status, &filled); err != nil {
		t.Fatal(err)
	}
	if status != "full" || filled != 1 {
		t.Fatalf("status=%s filled=%d", status, filled)
	}
}

func insertCharacter(t *testing.T, pool *db.Pool, shortCode, ownerPublicID string) string {
	t.Helper()
	publicID := ""
	err := pool.QueryRow(context.Background(), `
		INSERT INTO characters (short_code, name, owner_id, status)
		SELECT $1, $2, m.id, 'active'
		FROM members m WHERE m.public_id = $3
		RETURNING public_id::text`,
		shortCode, shortCode, ownerPublicID,
	).Scan(&publicID)
	if err != nil {
		t.Fatalf("insert character: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM characters WHERE public_id = $1`, publicID)
	})
	return publicID
}
