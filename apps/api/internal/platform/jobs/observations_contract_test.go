package jobs_test

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

var (
	_ jobs.SQLExecutor = pgx.Tx(nil)
	_ jobs.SQLExecutor = (*pgx.Conn)(nil)
	_ jobs.SQLExecutor = (*pgxpool.Conn)(nil)
	_ jobs.SQLExecutor = (*pgxpool.Pool)(nil)
	_ jobs.SQLExecutor = dbgen.DBTX(nil)
	_ dbgen.DBTX       = jobs.SQLExecutor(nil)
)

type j02Executor struct {
	exec     func(context.Context, string, ...any) (pgconn.CommandTag, error)
	query    func(context.Context, string, ...any) (pgx.Rows, error)
	queryRow func(context.Context, string, ...any) pgx.Row
}

func (e *j02Executor) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return e.exec(ctx, sql, args...)
}

func (e *j02Executor) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return e.query(ctx, sql, args...)
}

func (e *j02Executor) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return e.queryRow(ctx, sql, args...)
}

type j02Row func(...any) error

func (r j02Row) Scan(dest ...any) error { return r(dest...) }

type j02Gate func(context.Context, jobs.SQLExecutor) error

func (g j02Gate) Check(ctx context.Context, db jobs.SQLExecutor) error { return g(ctx, db) }

type j02Observer func(context.Context, jobs.SQLExecutor, jobs.LifecycleFact) error

func (o j02Observer) Record(ctx context.Context, db jobs.SQLExecutor, fact jobs.LifecycleFact) error {
	return o(ctx, db, fact)
}

func TestPhase3TaskJ02Acceptance(t *testing.T) {
	t.Run("borrowed execution scope has exact receipt and connection", func(t *testing.T) {
		receipt := jobs.Receipt{ID: "job-7", Token: "19"}
		conn := new(pgxpool.Conn)
		scope := jobs.ExecutionScope{Receipt: receipt, Connection: conn}
		shape := reflect.TypeOf(scope)
		if shape.NumField() != 2 || shape.Field(0).Name != "Receipt" || shape.Field(0).Type != reflect.TypeOf(receipt) || shape.Field(1).Name != "Connection" || shape.Field(1).Type != reflect.TypeOf(conn) {
			t.Fatalf("unexpected execution scope shape: %v", shape)
		}
		if scope.Receipt != receipt || scope.Connection != conn {
			t.Fatal("borrowed scope lost its exact receipt or connection")
		}
	})
	t.Run("WORK-SCHEMA executor and gate callbacks", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		clock := time.Date(2026, 10, 16, 7, 0, 0, 123456000, time.UTC)
		queryFailure := errors.New("query failed")
		rowFailure := errors.New("clock read failed")
		executor := &j02Executor{}
		rowCalls := 0
		executor.queryRow = func(gotCtx context.Context, sql string, args ...any) pgx.Row {
			rowCalls++
			if gotCtx != ctx || sql == "" || len(args) != 0 {
				t.Fatalf("QueryRow lost context or statement: %v %q %v", gotCtx, sql, args)
			}
			return j02Row(func(dest ...any) error {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				if rowCalls > 1 {
					return rowFailure
				}
				*dest[0].(*pgtype.Timestamptz) = pgtype.Timestamptz{Time: clock, Valid: true}
				return nil
			})
		}
		var contract jobs.SQLExecutor = executor
		options := jobs.StoreOptions{Gate: j02Gate(func(gotCtx context.Context, gotDB jobs.SQLExecutor) error {
			if gotDB != contract {
				t.Fatal("gate received a different executor")
			}
			got, err := dbgen.New(gotDB).JobClock(gotCtx)
			if err == nil && (!got.Valid || !got.Time.Equal(clock)) {
				t.Fatalf("sqlc clock value lost: %+v", got)
			}
			return err
		})}
		if err := options.Gate.Check(ctx, contract); err != nil {
			t.Fatal(err)
		}
		if err := options.Gate.Check(ctx, contract); !errors.Is(err, rowFailure) {
			t.Fatalf("gate lost read failure: %v", err)
		}
		cancel()
		if err := options.Gate.Check(ctx, contract); !errors.Is(err, context.Canceled) {
			t.Fatalf("gate lost cancellation: %v", err)
		}
		executor.query = func(gotCtx context.Context, sql string, args ...any) (pgx.Rows, error) {
			if gotCtx != ctx || sql != "SELECT $1" || !reflect.DeepEqual(args, []any{int64(3), "schema"}) {
				t.Fatalf("Query lost arguments: %v %q %v", gotCtx, sql, args)
			}
			return nil, queryFailure
		}
		if rows, err := contract.Query(ctx, "SELECT $1", int64(3), "schema"); rows != nil || !errors.Is(err, queryFailure) {
			t.Fatalf("Query lost failure: %v %v", rows, err)
		}
	})

	t.Run("WORK-OUTCOME exact typed fact and observer callback", func(t *testing.T) {
		slot := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
		started := time.Date(2026, 10, 16, 7, 0, 0, 123456000, time.UTC)
		finished := started.Add(time.Second)
		code := "JOB_INVARIANT_FAILED"
		fact := jobs.LifecycleFact{
			JobID: "11111111-1111-4111-8111-111111111111", JobKey: "gametime_fill:2026-10-14T00:00:00Z",
			Kind: "gametime_fill", BuildID: "build-1", State: jobs.Dead,
			Slot: &slot, StartedAt: &started, FinishedAt: &finished,
			LeaseToken: math.MaxInt64, Attempt: math.MaxInt32, SafeErrorCode: &code,
			EventKind: jobs.LifecycleEventFailed, EffectCount: math.MaxInt32,
		}
		encoded, err := json.Marshal(fact)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"JobID":"11111111-1111-4111-8111-111111111111","JobKey":"gametime_fill:2026-10-14T00:00:00Z","Kind":"gametime_fill","BuildID":"build-1","State":"dead","Slot":"2026-10-14T00:00:00Z","StartedAt":"2026-10-16T07:00:00.123456Z","FinishedAt":"2026-10-16T07:00:01.123456Z","LeaseToken":9223372036854775807,"Attempt":2147483647,"SafeErrorCode":"JOB_INVARIANT_FAILED","EventKind":"FAILED","EffectCount":2147483647}`
		if string(encoded) != want {
			t.Fatalf("fact JSON = %s, want %s", encoded, want)
		}
		var decoded jobs.LifecycleFact
		if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, fact) {
			t.Fatalf("fact roundtrip = %+v, error %v", decoded, err)
		}
		ctx := context.Background()
		writeFailure := errors.New("observation append failed")
		executor := &j02Executor{}
		writes := 0
		executor.exec = func(gotCtx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
			writes++
			if gotCtx != ctx || sql != "INSERT observation" || !reflect.DeepEqual(args, []any{encoded}) {
				t.Fatalf("Exec lost fact/context: %v %q %v", gotCtx, sql, args)
			}
			if writes > 1 {
				return pgconn.CommandTag{}, writeFailure
			}
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		}
		options := jobs.StoreOptions{Observer: j02Observer(func(gotCtx context.Context, gotDB jobs.SQLExecutor, got jobs.LifecycleFact) error {
			if gotDB != executor || !reflect.DeepEqual(got, fact) {
				t.Fatalf("observer lost executor/fact: %v %+v", gotDB, got)
			}
			payload, err := json.Marshal(got)
			if err != nil {
				return err
			}
			tag, err := gotDB.Exec(gotCtx, "INSERT observation", payload)
			if err == nil && tag.RowsAffected() != 1 {
				t.Fatalf("Exec lost command tag: %v", tag)
			}
			return err
		})}
		if err := options.Observer.Record(ctx, executor, decoded); err != nil {
			t.Fatal(err)
		}
		if err := options.Observer.Record(ctx, executor, decoded); !errors.Is(err, writeFailure) {
			t.Fatalf("observer lost append failure: %v", err)
		}
		if writes != 2 {
			t.Fatalf("observer write attempts = %d", writes)
		}
	})

	t.Run("WORK-OUTCOME event vocabulary and absent timestamps", func(t *testing.T) {
		kinds := []jobs.LifecycleEventKind{
			jobs.LifecycleEventEnqueued, jobs.LifecycleEventClaimed, jobs.LifecycleEventRetryScheduled,
			jobs.LifecycleEventSucceeded, jobs.LifecycleEventFailed, jobs.LifecycleEventCancelled, jobs.LifecycleEventEffectAdmitted,
		}
		encoded, err := json.Marshal(kinds)
		if err != nil || string(encoded) != `["ENQUEUED","CLAIMED","RETRY_SCHEDULED","SUCCEEDED","FAILED","CANCELLED","EFFECT_ADMITTED"]` {
			t.Fatalf("lifecycle vocabulary = %s, error %v", encoded, err)
		}
		encoded, err = json.Marshal(jobs.LifecycleFact{State: jobs.Queued, EventKind: jobs.LifecycleEventEnqueued})
		if err != nil {
			t.Fatal(err)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &fields); err != nil {
			t.Fatal(err)
		}
		for _, field := range []string{"Slot", "StartedAt", "FinishedAt", "SafeErrorCode"} {
			if string(fields[field]) != "null" {
				t.Errorf("absent %s = %s, want null", field, fields[field])
			}
		}
		if string(fields["LeaseToken"]) != "0" || string(fields["Attempt"]) != "0" || string(fields["EffectCount"]) != "0" {
			t.Fatalf("initial admission counts changed: %s", encoded)
		}
	})
}
