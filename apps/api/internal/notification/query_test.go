package notification

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type unreadRepoFunc func(context.Context, string) (int64, error)

func (fn unreadRepoFunc) UnreadCount(ctx context.Context, id string) (int64, error) {
	return fn(ctx, id)
}

type unreadContextKey struct{}

func TestUnreadCountPreservesCallerContextAndResult(t *testing.T) {
	ctx := context.WithValue(context.Background(), unreadContextKey{}, "request")
	for _, want := range []int64{0, 2, 100} {
		q := Queries{Repo: unreadRepoFunc(func(got context.Context, id string) (int64, error) {
			if got != ctx || id != unreadMemberID {
				t.Fatalf("query lost request context or caller: id=%q", id)
			}
			return want, nil
		})}
		got, err := q.UnreadCount(ctx, unreadMemberID)
		if err != nil || got != want {
			t.Fatalf("count=%d err=%v want=%d", got, err, want)
		}
	}
}

func TestUnreadCountFailsForMissingNegativeAndRepositoryErrors(t *testing.T) {
	privateErr := errors.New("private database count error")
	for _, tc := range []struct {
		name  string
		query Queries
		want  error
	}{
		{"missing", Queries{}, errUnavailable},
		{"negative", Queries{Repo: unreadRepoFunc(func(context.Context, string) (int64, error) { return -1, nil })}, errInvalidCount},
		{"error with nonzero result", Queries{Repo: unreadRepoFunc(func(context.Context, string) (int64, error) { return 5, privateErr })}, privateErr},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.query.UnreadCount(context.Background(), unreadMemberID)
			if got != 0 || !errors.Is(err, tc.want) {
				t.Fatalf("count=%d err=%v want=%v", got, err, tc.want)
			}
		})
	}
}

func TestUnreadCountCancellationIsNotAnEmptySuccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	q := Queries{Repo: unreadRepoFunc(func(got context.Context, _ string) (int64, error) { return 0, got.Err() })}
	if _, err := q.UnreadCount(ctx, unreadMemberID); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
}

type unreadDB struct {
	t     *testing.T
	ctx   context.Context
	calls int
	count int64
	err   error
}

func (f *unreadDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	f.t.Fatal("read path attempted Exec")
	return pgconn.CommandTag{}, errors.New("unexpected Exec")
}
func (f *unreadDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	f.t.Fatal("read path attempted list Query")
	return nil, errors.New("unexpected Query")
}
func (f *unreadDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	f.calls++
	if ctx != f.ctx || len(args) != 1 {
		f.t.Fatal("generated count lost context or UUID parameter")
	}
	id, ok := args[0].(pgtype.UUID)
	if !ok || !id.Valid || db.UUIDString(id) != unreadMemberID {
		f.t.Fatal("repository did not pass caller public UUID to generated query")
	}
	if !strings.Contains(sql, "n.member_id =") || !strings.Contains(sql, "m.public_id = $1") || !strings.Contains(sql, "n.read_at IS NULL") {
		f.t.Fatal("generated count lost recipient/read-state SQL scope")
	}
	return unreadRow{count: f.count, err: f.err}
}

type unreadRow struct {
	count int64
	err   error
}

func (row unreadRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	*(dest[0].(*int64)) = row.count
	return nil
}

func TestPostgresUnreadCountUsesGeneratedQueryAndPropagatesError(t *testing.T) {
	ctx := context.WithValue(context.Background(), unreadContextKey{}, "storage")
	privateErr := errors.New("private scan failure")
	for _, scanErr := range []error{nil, privateErr} {
		f := &unreadDB{t: t, ctx: ctx, count: 2, err: scanErr}
		got, err := NewPostgresRepository(dbgen.New(f)).UnreadCount(ctx, unreadMemberID)
		if f.calls != 1 || !errors.Is(err, scanErr) || (scanErr == nil && got != 2) {
			t.Fatalf("count=%d err=%v calls=%d", got, err, f.calls)
		}
	}
}

func TestPostgresUnreadCountRejectsInvalidIdentityAndMissingQueries(t *testing.T) {
	ctx := context.Background()
	f := &unreadDB{t: t, ctx: ctx}
	if _, err := NewPostgresRepository(dbgen.New(f)).UnreadCount(ctx, "not-a-uuid"); err == nil || f.calls != 0 {
		t.Fatalf("invalid identity reached SQL: err=%v calls=%d", err, f.calls)
	}
	for _, repo := range []*PostgresRepository{nil, NewPostgresRepository(nil)} {
		if _, err := repo.UnreadCount(ctx, unreadMemberID); !errors.Is(err, errUnavailable) {
			t.Fatalf("missing queries returned success: %v", err)
		}
	}
}
