package notification

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

type readRepoFunc func(context.Context, string, []string) error

func (f readRepoFunc) MarkRead(ctx context.Context, member string, ids []string) error {
	return f(ctx, member, ids)
}

type readRunnerFunc func(context.Context, func(CommandRepository) error) error

func (f readRunnerFunc) Do(ctx context.Context, fn func(CommandRepository) error) error {
	return f(ctx, fn)
}

const readID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

func TestMarkReadNormalizesBeforeOneUnitOfWork(t *testing.T) {
	ctx := context.WithValue(context.Background(), unreadContextKey{}, "mark-read")
	for _, ids := range [][]string{{}, {strings.ToUpper(readID), readID}} {
		begins, writes, commits := 0, 0, 0
		command := NewCommands(readRunnerFunc(func(got context.Context, fn func(CommandRepository) error) error {
			begins++
			if got != ctx {
				t.Fatal("runner lost context")
			}
			if err := fn(readRepoFunc(func(got context.Context, member string, normalized []string) error {
				writes++
				if got != ctx || member != unreadMemberID {
					t.Fatal("repository lost authority/context")
				}
				want := []string{}
				if len(ids) > 0 {
					want = []string{readID}
				}
				if !reflect.DeepEqual(normalized, want) {
					t.Fatalf("ids=%v want=%v", normalized, want)
				}
				return nil
			})); err != nil {
				return err
			}
			commits++
			return nil
		}))
		if err := command.MarkRead(ctx, unreadMemberID, ids); err != nil || begins != 1 || writes != 1 || commits != 1 {
			t.Fatalf("err=%v begin/write/commit=%d/%d/%d", err, begins, writes, commits)
		}
	}
}

func TestMarkReadInvalidIDsNeverBeginTransaction(t *testing.T) {
	command := NewCommands(readRunnerFunc(func(context.Context, func(CommandRepository) error) error {
		t.Fatal("invalid request began transaction")
		return nil
	}))
	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = readID
	}
	for _, ids := range [][]string{nil, {""}, {readID, "not-an-id"}, {" " + readID}, {strings.ReplaceAll(readID, "-", "")}, {"urn:uuid:" + readID}, {"{" + readID + "}"}, tooMany} {
		if err := command.MarkRead(context.Background(), unreadMemberID, ids); !errors.Is(err, errInvalidReadRequest) {
			t.Fatalf("invalid accepted: %v", err)
		}
	}
	if err := command.MarkRead(context.Background(), "not-a-member", []string{}); !errors.Is(err, errAuthorityUnavailable) {
		t.Fatalf("invalid member=%v", err)
	}
}

func TestMarkReadFailsClosedAndPreservesTransactionErrors(t *testing.T) {
	privateErr := errors.New("private SQL or uncertain commit failure")
	for _, tc := range []struct {
		name string
		cmd  Commands
		want error
	}{
		{"missing runner", Commands{}, errCommandUnavailable},
		{"missing repository", NewCommands(readRunnerFunc(func(_ context.Context, fn func(CommandRepository) error) error { return fn(nil) })), errCommandUnavailable},
		{"begin", NewCommands(readRunnerFunc(func(context.Context, func(CommandRepository) error) error { return privateErr })), privateErr},
		{"write rollback", NewCommands(readRunnerFunc(func(ctx context.Context, fn func(CommandRepository) error) error {
			return fn(readRepoFunc(func(context.Context, string, []string) error { return privateErr }))
		})), privateErr},
		{"commit unknown", NewCommands(readRunnerFunc(func(ctx context.Context, fn func(CommandRepository) error) error {
			if err := fn(readRepoFunc(func(context.Context, string, []string) error { return nil })); err != nil {
				return err
			}
			return privateErr
		})), privateErr},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.cmd.MarkRead(context.Background(), unreadMemberID, []string{readID}); !errors.Is(err, tc.want) {
				t.Fatalf("err=%v want=%v", err, tc.want)
			}
		})
	}
}
