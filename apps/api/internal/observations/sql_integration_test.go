//go:build integration

package observations_test

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestPhase3TaskOB03Acceptance(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable database; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("preexisting container identities %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("ob03"), postgres.WithUsername("ob03"), postgres.WithPassword("synthetic-ob03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container %s", container.GetContainerID())
	t.Cleanup(func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := container.Terminate(cleanCtx); err != nil {
			t.Error(err)
		}
		after, err := exec.CommandContext(cleanCtx, "docker", "ps", "-aq", "--no-trunc").Output()
		if err != nil {
			t.Error(err)
			return
		}
		for _, id := range strings.Fields(string(before)) {
			if !strings.Contains(string(after), id) {
				t.Errorf("preexisting container removed %s", id)
			}
		}
		if strings.Contains(string(after), container.GetContainerID()) {
			t.Error("owned PostgreSQL remains")
		}
		t.Logf("container identities after owned cleanup %s", strings.TrimSpace(string(after)))
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	migrationDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer migrationDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../../db/migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, migrationDB, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, table := range []string{"operational_observations", "job_redrives"} {
		var relation *string
		if err := pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1)::text`, table).Scan(&relation); err != nil || relation != nil {
			t.Fatalf("N8 retired ledger %s relation=%v err=%v", table, relation, err)
		}
	}
	if _, err := os.Stat("../../db/queries/observations.sql"); !os.IsNotExist(err) {
		t.Fatalf("N8 retired observations query source remains: %v", err)
	}
	t.Run("retained job lifecycle", func(t *testing.T) {
		store := jobs.NewPostgresStore(pool)
		job := jobs.Job{Key: "ob03:retained-job", Kind: "gametime_fill", Lane: "maintenance", Payload: []byte(`{"source":"ob03"}`)}
		for range 2 {
			if err := store.Enqueue(ctx, job); err != nil {
				t.Fatal(err)
			}
		}
		claimed, err := store.ClaimOne(ctx, job.Lane)
		if err != nil || claimed.ID == "" || claimed.State != jobs.Running || claimed.Attempts != 1 || claimed.Token != 1 {
			t.Fatalf("claim current lifecycle job=%+v err=%v", claimed, err)
		}
		receipt := jobs.Receipt{ID: claimed.ID, Token: strconv.FormatInt(claimed.Token, 10)}
		payload := []byte(`{"filled":true}`)
		if err := store.Complete(ctx, receipt, "succeed", jobs.Succeeded, payload, 0, ""); err != nil {
			t.Fatal(err)
		}
		var updatedAt time.Time
		if err := pool.QueryRow(ctx, `SELECT updated_at FROM background_jobs WHERE job_key=$1`, job.Key).Scan(&updatedAt); err != nil {
			t.Fatal(err)
		}
		if err := store.Complete(ctx, receipt, "succeed", jobs.Succeeded, payload, 0, ""); err != nil {
			t.Fatalf("terminal receipt replay: %v", err)
		}
		var count int
		var state, operation string
		var result []byte
		var persistedAt time.Time
		if err := pool.QueryRow(ctx, `SELECT count(*) OVER (),state,completion_operation,completion_payload,updated_at FROM background_jobs WHERE job_key=$1`, job.Key).Scan(&count, &state, &operation, &result, &persistedAt); err != nil {
			t.Fatal(err)
		}
		if count != 1 || state != "succeeded" || operation != "succeed" || !jobs.EqualJSON(result, payload) || !persistedAt.Equal(updatedAt) {
			t.Fatalf("canonical lifecycle count=%d state=%s operation=%s payload=%s updated=%s", count, state, operation, result, persistedAt)
		}
	})
	t.Run("retained bot heartbeat evidence", func(t *testing.T) {
		payload := []byte(`{"worker":"ob03","healthy":true}`)
		if err := dbgen.New(pool).InsertBotHeartbeat(ctx, payload); err != nil {
			t.Fatal(err)
		}
		var stored []byte
		var receivedAt time.Time
		if err := pool.QueryRow(ctx, `SELECT payload,received_at FROM bot_heartbeats`).Scan(&stored, &receivedAt); err != nil || !jobs.EqualJSON(stored, payload) || receivedAt.IsZero() {
			t.Fatalf("canonical heartbeat payload=%s receivedAt=%s err=%v", stored, receivedAt, err)
		}
	})
}
