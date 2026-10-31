//go:build integration

package jobs_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		code = 1
	}
	os.Exit(code)
}

func TestEffectGuardNativeCurrentReceiptAndTransactionOwnership(t *testing.T) {
	if _, err := jobs.NewEffectGuard(nil); err == nil {
		t.Fatal("nil transaction accepted")
	}
	var nilTx *pgxpool.Tx
	if _, err := jobs.NewEffectGuard(nilTx); err == nil {
		t.Fatal("typed nil transaction accepted")
	}
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	store := jobs.NewPostgresStore(f.Pool.Pool)
	if err := store.Enqueue(ctx, jobs.Job{Key: uuid.NewString(), Kind: "gametime_fill", Lane: "maintenance"}); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimOne(ctx, "maintenance")
	if err != nil || job.ID == "" {
		t.Fatalf("claim=%+v error=%v", job, err)
	}
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	guard, _ := jobs.NewEffectGuard(tx)
	permit, err := guard.Admit(ctx, job.Receipt())
	if err != nil || permit.Kind() != "gametime_fill" {
		t.Fatalf("permit kind=%s error=%v", permit.Kind(), err)
	}
	other, _ := jobs.NewEffectGuard(tx)
	if err := other.Recheck(ctx, permit); !errors.Is(err, jobs.ErrLease) {
		t.Fatalf("foreign guard=%v", err)
	}
	if err := guard.Recheck(ctx, jobs.EffectPermit{}); !errors.Is(err, jobs.ErrLease) {
		t.Fatalf("empty permit=%v", err)
	}
	if err := guard.Recheck(ctx, permit); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var state string
	var token int64
	var attempts int
	if err := f.Pool.QueryRow(ctx, `SELECT state,lease_token,attempts FROM background_jobs WHERE id=$1::bigint`, job.ID).Scan(&state, &token, &attempts); err != nil || state != "running" || token != job.Token || attempts != job.Attempts {
		t.Fatalf("effect guard changed work lifecycle: state=%s token=%d attempts=%d error=%v", state, token, attempts, err)
	}
	if err := guard.Recheck(ctx, permit); !errors.Is(err, pgx.ErrTxClosed) {
		t.Fatalf("committed transaction reused: %v", err)
	}
	if err := store.Succeed(ctx, job.Receipt()); err != nil {
		t.Fatal(err)
	}
	tx, _ = f.Pool.Begin(ctx)
	defer tx.Rollback(ctx)
	guard, _ = jobs.NewEffectGuard(tx)
	if _, err := guard.Admit(ctx, job.Receipt()); !errors.Is(err, jobs.ErrLease) {
		t.Fatalf("finished receipt admitted=%v", err)
	}
}

func TestPostgresFailWithCodeStoresSafeErrorCode(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	store := jobs.NewPostgresStore(f.Pool.Pool)
	claim := func(key string) jobs.Job {
		t.Helper()
		if err := store.Enqueue(ctx, jobs.Job{Key: key, Kind: "quest_discord_delivery", Lane: "discord", Payload: []byte(`{}`)}); err != nil {
			t.Fatal(err)
		}
		job, err := store.ClaimOne(ctx, "discord")
		if err != nil || job.ID == "" {
			t.Fatalf("claim=%+v error=%v", job, err)
		}
		return job
	}
	read := func(id string) (string, *string, *string) {
		t.Helper()
		var state string
		var code, message *string
		if err := f.Pool.QueryRow(ctx, `SELECT state,safe_error_code,error_message FROM background_jobs WHERE id=$1::bigint`, id).Scan(&state, &code, &message); err != nil {
			t.Fatal(err)
		}
		return state, code, message
	}
	parked := claim("safe-code-parked")
	if err := store.FailWithCode(ctx, parked.Receipt(), jobs.RepairRequired, "discord api status 403", "DISCORD_PERMISSION"); err != nil {
		t.Fatal(err)
	}
	state, code, message := read(parked.ID)
	if state != "repair_required" || code == nil || *code != "DISCORD_PERMISSION" || message == nil || *message != "discord api status 403" {
		t.Fatalf("parked state=%s code=%v message=%v", state, code, message)
	}
	if err := store.FailWithCode(ctx, parked.Receipt(), jobs.RepairRequired, "discord api status 403", "DISCORD_PERMISSION"); err != nil {
		t.Fatalf("replay: %v", err)
	}
	dead := claim("safe-code-dead")
	if err := store.Fail(ctx, dead.Receipt(), jobs.Dead, "boom"); err != nil {
		t.Fatal(err)
	}
	if state, code, _ := read(dead.ID); state != "dead" || code != nil {
		t.Fatalf("plain fail state=%s code=%v", state, code)
	}
}

func TestPostgresRequeuedParkedJobSucceedsWithoutSafeCode(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	store := jobs.NewPostgresStore(f.Pool.Pool)
	enqueue := func() {
		t.Helper()
		if err := store.Enqueue(ctx, jobs.Job{Key: "safe-code-requeue", Kind: "quest_discord_delivery", Lane: "discord", Payload: []byte(`{}`)}); err != nil {
			t.Fatal(err)
		}
	}
	claim := func() jobs.Job {
		t.Helper()
		job, err := store.ClaimOne(ctx, "discord")
		if err != nil || job.ID == "" {
			t.Fatalf("claim=%+v error=%v", job, err)
		}
		return job
	}
	enqueue()
	parked := claim()
	if err := store.FailWithCode(ctx, parked.Receipt(), jobs.RepairRequired, "discord api status 403", "DISCORD_PERMISSION"); err != nil {
		t.Fatal(err)
	}
	enqueue()
	var queuedCode *string
	if err := f.Pool.QueryRow(ctx, `SELECT safe_error_code FROM background_jobs WHERE id=$1::bigint`, parked.ID).Scan(&queuedCode); err != nil || queuedCode != nil {
		t.Fatalf("requeue kept safe_error_code=%v error=%v", queuedCode, err)
	}
	again := claim()
	if again.ID != parked.ID {
		t.Fatalf("requeue claimed a different job: %s vs %s", again.ID, parked.ID)
	}
	if err := store.Succeed(ctx, again.Receipt()); err != nil {
		t.Fatal(err)
	}
	var state string
	var code *string
	if err := f.Pool.QueryRow(ctx, `SELECT state,safe_error_code FROM background_jobs WHERE id=$1::bigint`, parked.ID).Scan(&state, &code); err != nil {
		t.Fatal(err)
	}
	if state != "succeeded" || code != nil {
		t.Fatalf("succeeded job state=%s safe_error_code=%v", state, code)
	}
}
