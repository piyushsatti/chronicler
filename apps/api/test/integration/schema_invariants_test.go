//go:build integration

package integration_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

const (
	seedAdmin = "11111111-1111-4111-8111-111111111111"
	seedDM    = "22222222-2222-4222-8222-222222222222"
	seedDoc   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
)

func TestSchemaInvariants(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()

	var handle string
	err := pool.QueryRow(ctx, `SELECT handle FROM members WHERE public_id = $1`, seedAdmin).Scan(&handle)
	if err != nil {
		t.Fatalf("seed member missing (goose up && seed first): %v", err)
	}
	if handle != "admin" {
		t.Fatalf("seed handle=%s", handle)
	}

	publicID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	short := fmt.Sprintf("inv-%d", time.Now().UnixNano())
	var got string
	err = pool.QueryRow(ctx, `
		INSERT INTO quests (public_id, short_code, kinds, dm_id, scheduled_at, document_id, created_by)
		SELECT $1::uuid, $2, ARRAY['standard'], m.id, now() + interval '1 day', d.id, m.id
		FROM members m, documents d
		WHERE m.public_id = $3 AND d.public_id = $4
		RETURNING short_code`,
		publicID, short, seedDM, seedDoc,
	).Scan(&got)
	if err != nil {
		t.Fatalf("insert quest: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM quests WHERE public_id = $1`, publicID)
	})

	var looked string
	if err := pool.QueryRow(ctx, `SELECT short_code FROM quests WHERE public_id = $1`, publicID).Scan(&looked); err != nil {
		t.Fatal(err)
	}
	if looked != short {
		t.Fatalf("lookup short_code=%s", looked)
	}

	rejectCheck(t, pool, `
		INSERT INTO quests (short_code, kinds, status, dm_id, scheduled_at, document_id, created_by)
		SELECT $1, ARRAY['standard'], 'nope', m.id, now(), d.id, m.id
		FROM members m, documents d
		WHERE m.public_id = $2 AND d.public_id = $3`,
		"bad-status-"+short, seedDM, seedDoc)

	rejectCheck(t, pool, `
		INSERT INTO quests (short_code, kinds, dm_id, scheduled_at, document_id, created_by)
		SELECT $1, ARRAY[]::text[], m.id, now(), d.id, m.id
		FROM members m, documents d
		WHERE m.public_id = $2 AND d.public_id = $3`,
		"empty-kinds-"+short, seedDM, seedDoc)

	rejectCheck(t, pool, `
		INSERT INTO quests (short_code, kinds, filled_count, slots_max, dm_id, scheduled_at, document_id, created_by)
		SELECT $1, ARRAY['standard'], 6, 5, m.id, now(), d.id, m.id
		FROM members m, documents d
		WHERE m.public_id = $2 AND d.public_id = $3`,
		"overfill-"+short, seedDM, seedDoc)

	rejectCheck(t, pool, `
		INSERT INTO member_follows (follower_id, followed_id)
		SELECT id, id FROM members WHERE public_id = $1`, seedAdmin)
}

func rejectCheck(t *testing.T, pool *db.Pool, sql string, args ...any) {
	t.Helper()
	_, err := pool.Exec(context.Background(), sql, args...)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("want check violation, got %v\nsql=%s", err, sql)
	}
}
