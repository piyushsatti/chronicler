//go:build integration

package worker_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/worker"
)

func TestHourlyMaintenancePrunesOldHeartbeats(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	at := time.Now().UTC().Truncate(time.Second)
	for _, received := range []time.Time{at.Add(-8 * 24 * time.Hour), at.Add(-6 * 24 * time.Hour)} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO bot_heartbeats(received_at) VALUES($1)`, received); err != nil {
			t.Fatal(err)
		}
	}
	store := jobs.NewPostgresStore(f.Pool.Pool)
	worker.RunScheduled(ctx, f.Pool.Pool, store)
	var count int
	var oldest, newest time.Time
	if err := f.Pool.QueryRow(ctx, `SELECT count(*),min(received_at),max(received_at) FROM bot_heartbeats`).Scan(&count, &oldest, &newest); err != nil {
		t.Fatal(err)
	}
	if count != 1 || !oldest.Equal(at.Add(-6*24*time.Hour)) || !newest.Equal(at.Add(-6*24*time.Hour)) {
		t.Fatalf("retained count=%d oldest=%s newest=%s", count, oldest, newest)
	}
	var admitted int
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM background_jobs WHERE lane='maintenance'`).Scan(&admitted); err != nil || admitted != 2 {
		t.Fatalf("daily admission count=%d error=%v", admitted, err)
	}
	raw, err := os.ReadFile("../../db/queries/ingest.sql")
	if err != nil {
		t.Fatal(err)
	}
	_, prune, found := strings.Cut(string(raw), "-- name: PruneBotHeartbeats :exec\n")
	if !found {
		t.Fatal("heartbeat retention query missing")
	}
	prune, _, _ = strings.Cut(prune, "-- name: ")
	cutoff := at.Add(-7 * 24 * time.Hour)
	for _, received := range []time.Time{cutoff.Add(-time.Microsecond), cutoff} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO bot_heartbeats(received_at) VALUES($1)`, received); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.Pool.Exec(ctx, prune, cutoff); err != nil {
		t.Fatal(err)
	}
	if err := f.Pool.QueryRow(ctx, `SELECT count(*),min(received_at),max(received_at) FROM bot_heartbeats`).Scan(&count, &oldest, &newest); err != nil || count != 2 || !oldest.Equal(cutoff) || !newest.Equal(at.Add(-6*24*time.Hour)) {
		t.Fatalf("strict cutoff retained count=%d oldest=%s newest=%s error=%v", count, oldest, newest, err)
	}
	if _, err := f.Pool.Exec(ctx, `CREATE FUNCTION reject_maintenance_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'admission unavailable'; END $$;
CREATE TRIGGER reject_maintenance_admission BEFORE INSERT ON background_jobs FOR EACH ROW EXECUTE FUNCTION reject_maintenance_admission()`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO bot_heartbeats(received_at) VALUES($1)`, at.Add(-8*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	worker.RunScheduled(ctx, f.Pool.Pool, store)
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM bot_heartbeats`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("admission failure blocked independent prune: count=%d error=%v", count, err)
	}
}
