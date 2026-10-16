//go:build integration

package idempotency

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskP03PostgresAcceptance(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("container identities before: %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("p03"), postgres.WithUsername("p03"), postgres.WithPassword("synthetic-p03"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container %s", container.GetContainerID())
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := container.Terminate(cleanup); err != nil {
			t.Errorf("terminate owned PostgreSQL: %v", err)
			return
		}
		after, err := exec.CommandContext(cleanup, "docker", "ps", "-aq", "--no-trunc").Output()
		if err != nil {
			t.Error(err)
			return
		}
		t.Logf("container identities after owned cleanup: %s", strings.TrimSpace(string(after)))
		ids := map[string]bool{}
		for _, id := range strings.Fields(string(after)) {
			ids[id] = true
		}
		for _, id := range strings.Fields(string(before)) {
			if !ids[id] {
				t.Errorf("preexisting container missing %s", id)
			}
		}
		if ids[container.GetContainerID()] {
			t.Error("owned PostgreSQL remains")
		}
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
	if err := goose.UpToContext(ctx, migrationDB, "../../../db/migrations", 2); err != nil {
		t.Fatal(err)
	}
	legacyActor := uuid.NewString()
	var legacyID int64
	if err := migrationDB.QueryRowContext(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name) VALUES($1,'p03-legacy','p03-legacy','Legacy') RETURNING id`, legacyActor).Scan(&legacyID); err != nil {
		t.Fatal(err)
	}
	legacyTime := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	if _, err := migrationDB.ExecContext(ctx, `INSERT INTO idempotency_keys(endpoint,actor_id,key,created_at) VALUES('legacy-profile',$1,'old-key',$2)`, legacyID, legacyTime); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, migrationDB, "../../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	reader, err := NewCompletedReceiptReader(pool)
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := product.Fingerprint(struct{ Timezone string }{"Europe/London"})
	if err != nil {
		t.Fatal(err)
	}
	op := "updateMyProfile"
	receiptFor := func(actor string) json.RawMessage {
		return json.RawMessage(fmt.Sprintf(`{"memberId":%q,"replayed":false}`, actor))
	}
	mustExec := func(t *testing.T, db interface {
		Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	}, q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, q, args...); err != nil {
			t.Fatalf("SQL %s: %v", q, err)
		}
	}
	newActor := func(t *testing.T) string {
		t.Helper()
		actor := uuid.NewString()
		mustExec(t, pool, `INSERT INTO members(public_id,discord_id,handle,display_name) VALUES($1::uuid,$2,$2,'P03')`, actor, "p03-"+actor)
		mustExec(t, pool, `INSERT INTO member_settings(member_id,timezone) SELECT id,'UTC' FROM members WHERE public_id=$1::uuid`, actor)
		return actor
	}
	begin := func(t *testing.T) (pgx.Tx, Repository) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
		repo, err := NewRepository(tx)
		if err != nil {
			t.Fatal(err)
		}
		return tx, repo
	}
	claimNew := func(t *testing.T, repo Repository, actor, operation, key string) Claim {
		t.Helper()
		claim, err := repo.Claim(ctx, actor, operation, key, fingerprint)
		if err != nil || claim.Replay {
			t.Fatalf("new claim = %+v, %v", claim, err)
		}
		return claim
	}
	complete := func(t *testing.T, repo Repository, claim Claim) {
		t.Helper()
		if err := repo.Complete(ctx, claim, receiptFor(claim.ActorID)); err != nil {
			t.Fatal(err)
		}
	}
	lookup := func(t *testing.T, actor, key string, want bool) {
		t.Helper()
		got, found, err := reader.LookupCompleted(ctx, actor, op, key, fingerprint)
		if err != nil || found != want {
			t.Fatalf("lookup = %s %v %v; want found %v", got, found, err, want)
		}
		if found {
			var a, b any
			if json.Unmarshal(got, &a) != nil || json.Unmarshal(receiptFor(actor), &b) != nil || !reflect.DeepEqual(a, b) {
				t.Fatalf("stored receipt differs: %s", got)
			}
		} else if got != nil {
			t.Fatalf("missing lookup returned %s", got)
		}
	}
	timezone := func(t *testing.T, actor string) string {
		t.Helper()
		var value string
		if err := pool.QueryRow(ctx, `SELECT timezone FROM member_settings s JOIN members m ON m.id=s.member_id WHERE m.public_id=$1::uuid`, actor).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	effect := func(t *testing.T, tx pgx.Tx, actor, value string) {
		t.Helper()
		mustExec(t, tx, `UPDATE member_settings s SET timezone=$2 FROM members m WHERE m.id=s.member_id AND m.public_id=$1::uuid`, actor, value)
	}
	countReceipt := func(t *testing.T, actor, key string) int {
		t.Helper()
		var count int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys r JOIN members m ON m.id=r.actor_id WHERE m.public_id=$1::uuid AND endpoint=$2 AND key=$3`, actor, "graphql:"+op, key).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	t.Run("uncommitted-completion-hidden-commit-effect-and-receipt-together", func(t *testing.T) {
		actor, key := newActor(t), "visibility"
		tx, repo := begin(t)
		claim := claimNew(t, repo, actor, op, key)
		effect(t, tx, actor, "Europe/London")
		lookup(t, actor, key, false)
		complete(t, repo, claim)
		lookup(t, actor, key, false)
		if got := timezone(t, actor); got != "UTC" {
			t.Fatalf("uncommitted effect visible: %s", got)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		lookup(t, actor, key, true)
		if got := timezone(t, actor); got != "Europe/London" {
			t.Fatalf("committed effect = %s", got)
		}
	})
	t.Run("incomplete-commit-rejects-effect-and-reservation", func(t *testing.T) {
		actor, key := newActor(t), "incomplete"
		tx, repo := begin(t)
		claimNew(t, repo, actor, op, key)
		effect(t, tx, actor, "Asia/Tokyo")
		err := tx.Commit(ctx)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Fatalf("incomplete commit = %v", err)
		}
		lookup(t, actor, key, false)
		if countReceipt(t, actor, key) != 0 || timezone(t, actor) != "UTC" {
			t.Fatal("rejected commit retained effect or receipt")
		}
	})
	t.Run("completed-receipt-rollback-and-required-effect-failure-are-atomic", func(t *testing.T) {
		for _, fail := range []bool{false, true} {
			t.Run(fmt.Sprint(fail), func(t *testing.T) {
				actor, key := newActor(t), "rollback"
				tx, repo := begin(t)
				claim := claimNew(t, repo, actor, op, key)
				effect(t, tx, actor, "Asia/Tokyo")
				complete(t, repo, claim)
				if fail {
					if _, err := tx.Exec(ctx, `UPDATE member_settings SET mode='invalid-p03' WHERE member_id=(SELECT id FROM members WHERE public_id=$1::uuid)`, actor); err == nil {
						t.Fatal("required effect failure not injected")
					}
					if err := tx.Commit(ctx); err == nil {
						t.Fatal("aborted transaction committed")
					}
				} else if err := tx.Rollback(ctx); err != nil {
					t.Fatal(err)
				}
				lookup(t, actor, key, false)
				if countReceipt(t, actor, key) != 0 || timezone(t, actor) != "UTC" {
					t.Fatal("rollback retained receipt or effect")
				}
				fresh, next := begin(t)
				complete(t, next, claimNew(t, next, actor, op, key))
				if err := fresh.Commit(ctx); err != nil {
					t.Fatal(err)
				}
				lookup(t, actor, key, true)
			})
		}
	})
	t.Run("same-key-concurrent-claim-waits-for-commit-or-rollback", func(t *testing.T) {
		for _, commitWinner := range []bool{true, false} {
			t.Run(fmt.Sprint(commitWinner), func(t *testing.T) {
				actor, key := newActor(t), "concurrent"
				winner, winnerRepo := begin(t)
				original := claimNew(t, winnerRepo, actor, op, key)
				effect(t, winner, actor, "Europe/London")
				waiter, waiterRepo := begin(t)
				winnerPID, waiterPID := winner.Conn().PgConn().PID(), waiter.Conn().PgConn().PID()
				waitCtx, stop := context.WithTimeout(ctx, 20*time.Second)
				type outcome struct {
					claim Claim
					err   error
				}
				result := make(chan outcome, 1)
				done := make(chan struct{})
				go func() {
					defer close(done)
					claim, err := waiterRepo.Claim(waitCtx, actor, op, key, fingerprint)
					result <- outcome{claim, err}
				}()
				defer func() { stop(); _ = winner.Rollback(context.Background()); <-done }()
				deadline := time.Now().Add(10 * time.Second)
				blocked := false
				for time.Now().Before(deadline) {
					var observed bool
					err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=$1 AND a.wait_event_type='Lock' AND l.locktype='transactionid' AND NOT l.granted AND $2::int=ANY(pg_blocking_pids(a.pid)))`, waiterPID, winnerPID).Scan(&observed)
					if err != nil {
						t.Fatal(err)
					}
					if observed {
						blocked = true
						break
					}
					select {
					case got := <-result:
						t.Fatalf("waiter returned before winner resolution: %+v %v", got.claim, got.err)
					default:
					}
					time.Sleep(10 * time.Millisecond)
				}
				if !blocked {
					t.Fatal("no actual PostgreSQL transaction-id wait observed")
				}
				t.Logf("observed waiter backend %d blocked on winner %d through pg_stat_activity, pg_locks and pg_blocking_pids", waiterPID, winnerPID)
				if commitWinner {
					complete(t, winnerRepo, original)
					if err := winner.Commit(ctx); err != nil {
						t.Fatal(err)
					}
				} else if err := winner.Rollback(ctx); err != nil {
					t.Fatal(err)
				}
				var got outcome
				select {
				case got = <-result:
				case <-waitCtx.Done():
					t.Fatal("waiter did not resolve after winner")
				}
				if got.err != nil || got.claim.Replay != commitWinner {
					t.Fatalf("waiter result = %+v %v", got.claim, got.err)
				}
				if commitWinner {
					var stored json.RawMessage
					if err := pool.QueryRow(ctx, `SELECT receipt FROM idempotency_keys WHERE endpoint=$1 AND actor_id=(SELECT id FROM members WHERE public_id=$2::uuid) AND key=$3`, "graphql:"+op, actor, key).Scan(&stored); err != nil {
						t.Fatal(err)
					}
					if string(got.claim.Receipt) != string(stored) {
						t.Fatalf("replay differs from stored receipt: %s != %s", got.claim.Receipt, stored)
					}
					if err := waiterRepo.Complete(ctx, got.claim, receiptFor(actor)); err == nil {
						t.Fatal("replay overwrote receipt")
					}
				} else {
					if got.claim.Receipt != nil {
						t.Fatal("rolled-back winner exposed receipt")
					}
					effect(t, waiter, actor, "America/New_York")
					complete(t, waiterRepo, got.claim)
				}
				if err := waiter.Commit(ctx); err != nil {
					t.Fatal(err)
				}
				lookup(t, actor, key, true)
				want := "Europe/London"
				if !commitWinner {
					want = "America/New_York"
				}
				if timezone(t, actor) != want || countReceipt(t, actor, key) != 1 {
					t.Fatal("waiter rewrote winner effect or lost fresh admission")
				}
			})
		}
	})
	t.Run("actor-exact-operation-and-key-isolation", func(t *testing.T) {
		actor, other := newActor(t), newActor(t)
		for _, scope := range [][3]string{{actor, op, "scope"}, {other, op, "scope"}, {actor, "updateMyDmProfile", "scope"}, {actor, op, "Scope"}} {
			tx, repo := begin(t)
			claim := claimNew(t, repo, scope[0], scope[1], scope[2])
			complete(t, repo, claim)
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			var endpoint string
			if err := pool.QueryRow(ctx, `SELECT endpoint FROM idempotency_keys WHERE actor_id=(SELECT id FROM members WHERE public_id=$1::uuid) AND endpoint=$2 AND key=$3`, scope[0], "graphql:"+scope[1], scope[2]).Scan(&endpoint); err != nil || endpoint != "graphql:"+scope[1] {
				t.Fatalf("scope endpoint %s %v", endpoint, err)
			}
		}
	})
	t.Run("fingerprint-conflict-discloses-nothing-and-does-not-write", func(t *testing.T) {
		actor, key := newActor(t), "mismatch"
		tx, repo := begin(t)
		complete(t, repo, claimNew(t, repo, actor, op, key))
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		var before, after string
		snapshot := `SELECT row_to_json(r)::text || ':' || r.xmin::text FROM idempotency_keys r WHERE endpoint=$1 AND actor_id=(SELECT id FROM members WHERE public_id=$2::uuid) AND key=$3`
		if err := pool.QueryRow(ctx, snapshot, "graphql:"+op, actor, key).Scan(&before); err != nil {
			t.Fatal(err)
		}
		other, err := product.Fingerprint(struct{ Timezone string }{"Asia/Tokyo"})
		if err != nil {
			t.Fatal(err)
		}
		tx, repo = begin(t)
		claim, err := repo.Claim(ctx, actor, op, key, other)
		var expected *apierr.Error
		if !errors.As(err, &expected) || expected.Code != apierr.Conflict || claim.Replay || claim.Receipt != nil {
			t.Fatalf("conflict = %+v %v", claim, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		got, found, err := reader.LookupCompleted(ctx, actor, op, key, other)
		if !errors.As(err, &expected) || expected.Code != apierr.Conflict || found || got != nil {
			t.Fatalf("lookup conflict = %s %v %v", got, found, err)
		}
		if err := pool.QueryRow(ctx, snapshot, "graphql:"+op, actor, key).Scan(&after); err != nil {
			t.Fatal(err)
		}
		if before != after || timezone(t, actor) != "UTC" {
			t.Fatal("conflict changed receipt tuple or business effect")
		}
	})
	t.Run("legacy-null-preservation-and-aged-product-replay", func(t *testing.T) {
		var endpoint, key string
		var storedActor int64
		var created time.Time
		var allNull bool
		if err := pool.QueryRow(ctx, `SELECT endpoint,actor_id,key,created_at,fingerprint IS NULL AND receipt IS NULL AND completed_at IS NULL FROM idempotency_keys WHERE endpoint='legacy-profile'`).Scan(&endpoint, &storedActor, &key, &created, &allNull); err != nil {
			t.Fatal(err)
		}
		if endpoint != "legacy-profile" || key != "old-key" || storedActor != legacyID || !created.Equal(legacyTime) || !allNull {
			t.Fatal("legacy reservation changed across real migrations")
		}
		lookup(t, legacyActor, key, false)
		actor, key := newActor(t), "aged"
		tx, repo := begin(t)
		complete(t, repo, claimNew(t, repo, actor, op, key))
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		mustExec(t, pool, `UPDATE idempotency_keys SET created_at=now()-interval '400 days',completed_at=now()-interval '399 days' WHERE endpoint=$1 AND actor_id=(SELECT id FROM members WHERE public_id=$2::uuid) AND key=$3`, "graphql:"+op, actor, key)
		lookup(t, actor, key, true)
		tx, repo = begin(t)
		claim, err := repo.Claim(ctx, actor, op, key, fingerprint)
		if err != nil || !claim.Replay {
			t.Fatalf("aged replay = %+v %v", claim, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	})
}
