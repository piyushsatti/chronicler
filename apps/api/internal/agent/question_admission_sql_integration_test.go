//go:build integration

package agent_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func questionNamedSQL(t *testing.T, name, mode string) string {
	t.Helper()
	raw, err := os.ReadFile("../../db/queries/agent.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, section := range strings.Split(string(raw), "-- name: ")[1:] {
		header, query, ok := strings.Cut(section, "\n")
		if ok && strings.Fields(header)[0] == name {
			if strings.TrimSpace(header) != name+" "+mode {
				t.Fatalf("%s annotation=%q want %s", name, header, mode)
			}
			return strings.NewReplacer("sqlc.arg(job_id)", "$1", "sqlc.arg(payload)", "$2").Replace(strings.TrimSpace(query))
		}
	}
	t.Fatalf("missing actual named SQL %s", name)
	return ""
}

type questionExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func questionExec(t *testing.T, ctx context.Context, db questionExecutor, query string, args ...any) int64 {
	t.Helper()
	result, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		t.Fatal(err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		t.Fatal(err)
	}
	return count
}
func questionSnapshot(t *testing.T, ctx context.Context, db *sql.DB, id string) string {
	t.Helper()
	var snapshot string
	if err := db.QueryRowContext(ctx, `SELECT to_jsonb(j)::text FROM background_jobs j WHERE public_id=$1`, id).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}
func questionPGError(t *testing.T, err error, code string) {
	t.Helper()
	var pgerr *pgconn.PgError
	if !errors.As(err, &pgerr) || pgerr.Code != code {
		t.Fatalf("error=%v want PostgreSQL %s", err, code)
	}
}
func questionWaitForConflict(t *testing.T, ctx context.Context, db *sql.DB, pid, blocker int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var blocked bool
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(a.wait_event_type='Lock',false) AND $2=ANY(pg_blocking_pids(a.pid)) AND EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='transactionid' AND NOT l.granted) FROM pg_stat_activity a WHERE a.pid=$1`, pid, blocker).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("admission did not reach proven PostgreSQL unique-key transaction wait")
}

func TestQuestionAdmissionSQL(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Minute)
	defer cancel()
	before, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("preexisting container identities: %s", strings.TrimSpace(string(before)))
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("legj09"), postgres.WithUsername("legj09"), postgres.WithPassword("synthetic-legj09"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container: %s", container.GetContainerID())
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
		remaining := map[string]bool{}
		for _, id := range strings.Fields(string(after)) {
			remaining[id] = true
		}
		for _, id := range strings.Fields(string(before)) {
			if !remaining[id] {
				t.Errorf("preexisting container missing: %s", id)
			}
		}
		if remaining[container.GetContainerID()] {
			t.Error("owned PostgreSQL container remains")
		}
		t.Logf("container identities after owned cleanup: %s", strings.TrimSpace(string(after)))
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(6)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, "../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	var version int64
	if err := db.QueryRowContext(ctx, `SELECT max(version_id) FROM goose_db_version WHERE is_applied`).Scan(&version); err != nil || version != 2 {
		t.Fatalf("migration version=%d error=%v", version, err)
	}
	admit := questionNamedSQL(t, "InsertQuestionJob", ":execrows")
	insertQuestion := questionNamedSQL(t, "InsertAgentQuestion", ":exec")
	getQuestion := questionNamedSQL(t, "GetAgentQuestion", ":one")
	payload := `{"version":1,"type":"question.requested","question":"original?","history":[]}`
	t.Run("new-admission-and-replay", func(t *testing.T) {
		id := uuid.NewString()
		var lower, upper, deadline time.Time
		if err := db.QueryRowContext(ctx, `SELECT clock_timestamp()`).Scan(&lower); err != nil {
			t.Fatal(err)
		}
		if n := questionExec(t, ctx, db, admit, id, payload); n != 1 {
			t.Fatalf("new admission rows=%d", n)
		}
		var key, kind, lane, state string
		var attempts, token int64
		var samePayload bool
		if err := db.QueryRowContext(ctx, `SELECT job_key,kind,lane,state,attempts,lease_token,payload=$2::jsonb,question_deadline_at,clock_timestamp() FROM background_jobs WHERE public_id=$1`, id, payload).Scan(&key, &kind, &lane, &state, &attempts, &token, &samePayload, &deadline, &upper); err != nil {
			t.Fatal(err)
		}
		if key != "agent:"+id || kind != "agent_question" || lane != "agent" || state != "queued" || attempts != 0 || token != 0 || !samePayload {
			t.Fatalf("incorrect admission key=%s kind=%s lane=%s state=%s attempts=%d token=%d payload=%v", key, kind, lane, state, attempts, token, samePayload)
		}
		if deadline.Before(lower.Add(100*time.Second)) || deadline.After(upper.Add(100*time.Second)) {
			t.Fatalf("deadline=%s outside actual DB admission bounds [%s,%s]", deadline, lower.Add(100*time.Second), upper.Add(100*time.Second))
		}
		original := questionSnapshot(t, ctx, db, id)
		if n := questionExec(t, ctx, db, admit, id, `{"different":true}`); n != 0 {
			t.Fatalf("replay rows=%d", n)
		}
		if got := questionSnapshot(t, ctx, db, id); got != original {
			t.Fatalf("replay changed original row\nbefore %s\nafter %s", original, got)
		}
	})
	for _, fixture := range []struct{ state, view string }{{"queued", "queued"}, {"running", "claimed"}, {"succeeded", "answered"}, {"retry_wait", "queued"}, {"repair_required", "failed"}, {"dead", "failed"}, {"cancelled", "failed"}} {
		t.Run("preserve-"+fixture.state, func(t *testing.T) {
			id := uuid.NewString()
			questionExec(t, ctx, db, admit, id, payload)
			questionExec(t, ctx, db, `UPDATE background_jobs SET state=$2,attempts=7,lease_token=89,lease_expires_at=CASE WHEN $2='running' THEN clock_timestamp()+interval '120 seconds' END,claimed_at=CASE WHEN $2='running' THEN clock_timestamp() END,attempt_deadline_at=CASE WHEN $2='running' THEN clock_timestamp()+interval '10 minutes' END,completion_operation='retained',completion_payload='{"answer":"retained"}',error_message='retained-error',redrive_count=3,safe_error_code='RETAINED' WHERE public_id=$1`, id, fixture.state)
			var internalID int64
			if err := db.QueryRowContext(ctx, `SELECT id FROM background_jobs WHERE public_id=$1`, id).Scan(&internalID); err != nil {
				t.Fatal(err)
			}
			questionExec(t, ctx, db, insertQuestion, internalID, "original?", `[{"role":"user","content":"retained"}]`)
			questionExec(t, ctx, db, `UPDATE agent_questions SET result='{"answer":"retained"}' WHERE job_id=$1`, internalID)
			original := questionSnapshot(t, ctx, db, id)
			if n := questionExec(t, ctx, db, admit, id, `{"replacement":true}`); n != 0 {
				t.Fatalf("existing %s rows=%d", fixture.state, n)
			}
			if got := questionSnapshot(t, ctx, db, id); got != original {
				t.Fatalf("existing %s row changed\nbefore %s\nafter %s", fixture.state, original, got)
			}
			var gotID int64
			var gotPublic, question, view string
			var history, result []byte
			var deadline time.Time
			if err := db.QueryRowContext(ctx, getQuestion, id).Scan(&gotID, &gotPublic, &question, &history, &deadline, &view, &result); err != nil {
				t.Fatal(err)
			}
			if gotID != internalID || gotPublic != id || question != "original?" || view != fixture.view || string(history) != `[{"role": "user", "content": "retained"}]` || string(result) != `{"answer": "retained"}` {
				t.Fatalf("retained answer view changed id=%d public=%s question=%s state=%s history=%s result=%s", gotID, gotPublic, question, view, history, result)
			}
		})
	}
	t.Run("deadline-uses-admission-clock-not-transaction-start", func(t *testing.T) {
		id := uuid.NewString()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		var transactionStart, lower, upper, deadline time.Time
		if err := tx.QueryRowContext(ctx, `SELECT transaction_timestamp()`).Scan(&transactionStart); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRowContext(ctx, `SELECT clock_timestamp()`).Scan(&lower); err != nil {
			t.Fatal(err)
		}
		if !lower.After(transactionStart) {
			t.Fatal("database clock did not advance beyond transaction start")
		}
		if n := questionExec(t, ctx, tx, admit, id, payload); n != 1 {
			t.Fatalf("new admission rows=%d", n)
		}
		if err := tx.QueryRowContext(ctx, `SELECT question_deadline_at,clock_timestamp() FROM background_jobs WHERE public_id=$1`, id).Scan(&deadline, &upper); err != nil {
			t.Fatal(err)
		}
		if deadline.Before(lower.Add(100*time.Second)) || deadline.After(upper.Add(100*time.Second)) {
			t.Fatalf("deadline=%s outside actual DB admission clocks [%s,%s]", deadline, lower.Add(100*time.Second), upper.Add(100*time.Second))
		}
	})
	t.Run("public-id-collision-preserves-unrelated-job", func(t *testing.T) {
		id := uuid.NewString()
		questionExec(t, ctx, db, `INSERT INTO background_jobs(public_id,job_key,kind,lane,payload) VALUES($1::uuid,'unrelated:'||$1::uuid::text,'other','other','{"retained":true}')`, id)
		original := questionSnapshot(t, ctx, db, id)
		if n := questionExec(t, ctx, db, admit, id, payload); n != 0 {
			t.Fatalf("public-ID collision rows=%d", n)
		}
		if got := questionSnapshot(t, ctx, db, id); got != original {
			t.Fatal("public-ID collision changed unrelated original job")
		}
	})
	t.Run("job-key-collision-is-error-not-replay", func(t *testing.T) {
		id := uuid.NewString()
		other := uuid.NewString()
		questionExec(t, ctx, db, `INSERT INTO background_jobs(public_id,job_key,kind,lane) VALUES($1,$2,'other','other')`, other, "agent:"+id)
		original := questionSnapshot(t, ctx, db, other)
		_, err := db.ExecContext(ctx, admit, id, payload)
		questionPGError(t, err, "23505")
		if got := questionSnapshot(t, ctx, db, other); got != original {
			t.Fatal("job-key conflict changed unrelated original job")
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM background_jobs WHERE public_id=$1`, id).Scan(&count); err != nil || count != 0 {
			t.Fatalf("collision admitted rows=%d error=%v", count, err)
		}
	})
	t.Run("different-public-id-gets-independent-admission", func(t *testing.T) {
		first, second := uuid.NewString(), uuid.NewString()
		if n := questionExec(t, ctx, db, admit, first, payload); n != 1 {
			t.Fatalf("first rows=%d", n)
		}
		if n := questionExec(t, ctx, db, admit, second, payload); n != 1 {
			t.Fatalf("independent rows=%d", n)
		}
	})
	t.Run("required-question-failure-rolls-back-job", func(t *testing.T) {
		id := uuid.NewString()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if n := questionExec(t, ctx, tx, admit, id, payload); n != 1 {
			t.Fatalf("admission rows=%d", n)
		}
		var internalID int64
		if err := tx.QueryRowContext(ctx, `SELECT id FROM background_jobs WHERE public_id=$1`, id).Scan(&internalID); err != nil {
			t.Fatal(err)
		}
		_, err = tx.ExecContext(ctx, insertQuestion, internalID, nil, `[]`)
		questionPGError(t, err, "23502")
		if err := tx.Commit(); err == nil {
			t.Fatal("failed required persistence committed")
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM background_jobs WHERE public_id=$1`, id).Scan(&count); err != nil || count != 0 {
			t.Fatalf("rollback jobs=%d error=%v", count, err)
		}
		if n := questionExec(t, ctx, db, admit, id, payload); n != 1 {
			t.Fatalf("fresh admission after rollback rows=%d", n)
		}
	})
	for _, commit := range []bool{true, false} {
		name := "concurrent-winner-rollback"
		if commit {
			name = "concurrent-winner-commit"
		}
		t.Run(name, func(t *testing.T) {
			id := uuid.NewString()
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			var blocker int
			if err := tx.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&blocker); err != nil {
				t.Fatal(err)
			}
			if n := questionExec(t, ctx, tx, admit, id, payload); n != 1 {
				t.Fatalf("first admission rows=%d", n)
			}
			conn, err := db.Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			defer tx.Rollback()
			var pid int
			if err := conn.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&pid); err != nil {
				t.Fatal(err)
			}
			type outcome struct {
				n   int64
				err error
			}
			result := make(chan outcome, 1)
			go func() {
				r, e := conn.ExecContext(ctx, admit, id, `{"contender":true}`)
				if e != nil {
					result <- outcome{err: e}
					return
				}
				n, e := r.RowsAffected()
				result <- outcome{n, e}
			}()
			questionWaitForConflict(t, ctx, db, pid, blocker)
			if commit {
				err = tx.Commit()
			} else {
				err = tx.Rollback()
			}
			if err != nil {
				t.Fatal(err)
			}
			got := <-result
			want := int64(1)
			wantPayload := `{"contender":true}`
			if commit {
				want = 0
				wantPayload = payload
			}
			if got.err != nil || got.n != want {
				t.Fatalf("contender rows=%d want=%d error=%v", got.n, want, got.err)
			}
			var count int
			if err := db.QueryRowContext(ctx, `SELECT count(*) FROM background_jobs WHERE public_id=$1 AND payload=$2::jsonb`, id, wantPayload).Scan(&count); err != nil || count != 1 {
				t.Fatalf("winning row count=%d error=%v", count, err)
			}
		})
	}
	t.Logf("executed actual owned agent.sql against Goose version %d", version)
}
