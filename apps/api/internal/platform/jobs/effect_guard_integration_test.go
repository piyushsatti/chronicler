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
