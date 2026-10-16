package idempotency

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type receiptCall struct {
	query string
	args  []any
}

type receiptTestRow func(...any) error

func (r receiptTestRow) Scan(out ...any) error { return r(out...) }

type receiptTestTx struct {
	pgx.Tx
	rows     []receiptTestRow
	reads    []receiptCall
	writes   []receiptCall
	writeErr error
	affected int64
}

func (tx *receiptTestTx) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	tx.reads = append(tx.reads, receiptCall{query, append([]any(nil), args...)})
	if len(tx.rows) == 0 {
		return receiptTestRow(func(...any) error { return errors.New("unexpected query") })
	}
	r := tx.rows[0]
	tx.rows = tx.rows[1:]
	return r
}

func (tx *receiptTestTx) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	tx.writes = append(tx.writes, receiptCall{query, append([]any(nil), args...)})
	if tx.affected == 1 {
		return pgconn.NewCommandTag("UPDATE 1"), tx.writeErr
	}
	return pgconn.NewCommandTag("UPDATE 0"), tx.writeErr
}

func noReceiptRow(err error) receiptTestRow {
	return func(...any) error { return err }
}

func insertedReceiptRow(fingerprint string) receiptTestRow {
	return func(out ...any) error {
		*out[0].(*string) = fingerprint
		return nil
	}
}

func storedReceiptRow(fingerprint *string, receipt []byte, completed bool) receiptTestRow {
	return func(out ...any) error {
		*out[0].(**string) = fingerprint
		*out[1].(*[]byte) = receipt
		*out[2].(*bool) = completed
		return nil
	}
}

func TestPhase3TaskP03Acceptance(t *testing.T) {
	ctx := context.Background()
	actor := "10000000-0000-4000-8000-000000000abc"
	operation, key := "updateMyProfile", "literal key "
	fingerprint, err := product.Fingerprint(struct{ Name string }{"New name"})
	if err != nil {
		t.Fatal(err)
	}
	receipt := json.RawMessage(`{"memberId":"10000000-0000-4000-8000-000000000abc","replayed":false}`)
	newRepo := func(t *testing.T, tx *receiptTestTx) Repository {
		t.Helper()
		repo, err := NewRepository(tx)
		if err != nil {
			t.Fatal(err)
		}
		return repo
	}
	assertCode := func(t *testing.T, err error, code apierr.Code) {
		t.Helper()
		var expected *apierr.Error
		if !errors.As(err, &expected) || expected.Code != code {
			t.Fatalf("error = %v; want %s", err, code)
		}
	}

	t.Run("constructors-reject-nil-and-reader-is-read-only", func(t *testing.T) {
		var tx *receiptTestTx
		for _, input := range []pgx.Tx{nil, tx} {
			if repo, err := NewRepository(input); err == nil || repo != nil {
				t.Fatalf("nil transaction = %v, %v", repo, err)
			}
		}
		if reader, err := NewCompletedReceiptReader(nil); err == nil || reader != nil {
			t.Fatalf("nil reader = %v, %v", reader, err)
		}
		if reader, err := NewCompletedReceiptReader(tx); err == nil || reader != nil {
			t.Fatalf("typed nil reader = %v, %v", reader, err)
		}
		reader, err := NewCompletedReceiptReader(&receiptTestTx{})
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := any(reader).(Repository); ok {
			t.Fatal("completed reader exposes mutation repository")
		}
	})

	t.Run("claim-and-complete-use-current-transaction-and-original-fingerprint", func(t *testing.T) {
		tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, affected: 1}
		repo := newRepo(t, tx)
		claim, err := repo.Claim(ctx, strings.ToUpper(actor), operation, key, fingerprint)
		if err != nil || claim.Replay || claim.Receipt != nil || claim.ActorID != actor || claim.Operation != operation || claim.Key != key || claim.Fingerprint != fingerprint {
			t.Fatalf("new claim = %+v, %v", claim, err)
		}
		if err := repo.Complete(ctx, claim, receipt); err != nil {
			t.Fatal(err)
		}
		wantArgs := []any{actor, "graphql:" + operation, key, fingerprint}
		if len(tx.reads) != 1 || !reflect.DeepEqual(tx.reads[0].args, wantArgs) {
			t.Fatalf("claim calls = %#v", tx.reads)
		}
		if !strings.Contains(tx.reads[0].query, "ON CONFLICT (endpoint, actor_id, key) DO NOTHING") || strings.Contains(tx.reads[0].query, "DO UPDATE") {
			t.Fatalf("claim modifies colliding receipts: %s", tx.reads[0].query)
		}
		if len(tx.writes) != 1 || !reflect.DeepEqual(tx.writes[0].args[:4], wantArgs) || string(tx.writes[0].args[4].([]byte)) != string(receipt) {
			t.Fatalf("completion calls = %#v", tx.writes)
		}
		if !strings.Contains(tx.writes[0].query, "r.receipt IS NULL AND r.completed_at IS NULL") {
			t.Fatal("completion can overwrite an existing receipt")
		}
		if err := repo.Complete(ctx, claim, receipt); err == nil || len(tx.writes) != 1 {
			t.Fatalf("completed claim was reused: %v, %#v", err, tx.writes)
		}
	})

	t.Run("collision-replays-exact-original-receipt-without-completion-write", func(t *testing.T) {
		tx := &receiptTestTx{rows: []receiptTestRow{noReceiptRow(pgx.ErrNoRows), storedReceiptRow(&fingerprint, receipt, true)}}
		repo := newRepo(t, tx)
		claim, err := repo.Claim(ctx, actor, operation, key, fingerprint)
		if err != nil || !claim.Replay || string(claim.Receipt) != string(receipt) {
			t.Fatalf("replay = %+v, %v", claim, err)
		}
		if len(tx.reads) != 2 || !strings.HasSuffix(tx.reads[1].query, "FOR UPDATE OF r") {
			t.Fatalf("collision did not lock winning receipt: %#v", tx.reads)
		}
		if !reflect.DeepEqual(tx.reads[1].args, []any{actor, "graphql:" + operation, key}) {
			t.Fatalf("collision identity = %#v", tx.reads[1].args)
		}
		claim.Receipt[0] = '['
		if receipt[0] != '{' {
			t.Fatal("returned receipt aliases driver bytes")
		}
		if err := repo.Complete(ctx, claim, receipt); err == nil || len(tx.writes) != 0 {
			t.Fatalf("replay completed again: %v", err)
		}
	})

	t.Run("actor-operation-key-scope-is-preserved", func(t *testing.T) {
		for _, input := range [][3]string{{actor, operation, key}, {"10000000-0000-4000-8000-000000000abd", operation, key}, {actor, "UpdateMyProfile", key}, {actor, operation, "literal key"}} {
			tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}}
			claim, err := newRepo(t, tx).Claim(ctx, input[0], input[1], input[2], fingerprint)
			if err != nil || claim.Replay || !reflect.DeepEqual(tx.reads[0].args[:3], []any{input[0], "graphql:" + input[1], input[2]}) {
				t.Fatalf("scope %v = %+v, %v, %#v", input, claim, err, tx.reads)
			}
		}
	})

	t.Run("fingerprint-mismatch-is-conflict-and-never-returns-receipt", func(t *testing.T) {
		other := strings.Repeat("0", 64)
		for _, claimMode := range []bool{false, true} {
			tx := &receiptTestTx{}
			if claimMode {
				tx.rows = append(tx.rows, noReceiptRow(pgx.ErrNoRows))
			}
			tx.rows = append(tx.rows, storedReceiptRow(&other, receipt, true))
			if claimMode {
				claim, err := newRepo(t, tx).Claim(ctx, actor, operation, key, fingerprint)
				assertCode(t, err, apierr.Conflict)
				if claim.Replay || claim.Receipt != nil {
					t.Fatalf("conflict exposed receipt: %+v", claim)
				}
			} else {
				reader, _ := NewCompletedReceiptReader(tx)
				got, found, err := reader.LookupCompleted(ctx, actor, operation, key, fingerprint)
				assertCode(t, err, apierr.Conflict)
				if got != nil || found {
					t.Fatalf("conflict exposed receipt: %s %v", got, found)
				}
			}
			if len(tx.writes) != 0 {
				t.Fatal("conflict wrote data")
			}
		}
	})

	t.Run("lookup-missing-legacy-and-corrupt-completion", func(t *testing.T) {
		for _, c := range []struct {
			name               string
			row                receiptTestRow
			wantFound, wantErr bool
		}{
			{"missing", noReceiptRow(pgx.ErrNoRows), false, false},
			{"legacy-three-null", storedReceiptRow(nil, nil, false), false, false},
			{"complete", storedReceiptRow(&fingerprint, receipt, true), true, false},
			{"uncompleted", storedReceiptRow(&fingerprint, nil, false), false, true},
			{"no-fingerprint", storedReceiptRow(nil, receipt, true), false, true},
			{"null-json", storedReceiptRow(&fingerprint, []byte("null"), true), false, true},
			{"malformed-json", storedReceiptRow(&fingerprint, []byte("{"), true), false, true},
			{"no-time", storedReceiptRow(&fingerprint, receipt, false), false, true},
		} {
			t.Run(c.name, func(t *testing.T) {
				tx := &receiptTestTx{rows: []receiptTestRow{c.row}}
				reader, _ := NewCompletedReceiptReader(tx)
				got, found, err := reader.LookupCompleted(ctx, actor, operation, key, fingerprint)
				if found != c.wantFound || (err != nil) != c.wantErr || found && string(got) != string(receipt) || !found && got != nil {
					t.Fatalf("lookup = %s, %v, %v", got, found, err)
				}
				if len(tx.writes) != 0 || strings.Contains(tx.reads[0].query, "FOR UPDATE") {
					t.Fatal("completed reader mutated or locked receipt")
				}
			})
		}
	})

	t.Run("input-validation-happens-before-database", func(t *testing.T) {
		for _, input := range [][4]string{{actor, operation, "", fingerprint}, {"", operation, key, fingerprint}, {"00000000-0000-0000-0000-000000000000", operation, key, fingerprint}, {actor, "graphql:" + operation, key, fingerprint}, {actor, "", key, fingerprint}, {actor, "1operation", key, fingerprint}, {actor, operation, key, "short"}, {actor, operation, key, strings.Repeat("A", 64)}} {
			tx := &receiptTestTx{}
			repo := newRepo(t, tx)
			_, err := repo.Claim(ctx, input[0], input[1], input[2], input[3])
			assertCode(t, err, apierr.Invalid)
			reader, _ := NewCompletedReceiptReader(tx)
			_, _, err = reader.LookupCompleted(ctx, input[0], input[1], input[2], input[3])
			assertCode(t, err, apierr.Invalid)
			if len(tx.reads)+len(tx.writes) != 0 {
				t.Fatal("invalid input reached database")
			}
		}
	})

	t.Run("completion-rejects-unclaimed-modified-cross-transaction-and-invalid-json", func(t *testing.T) {
		tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, affected: 1}
		repo := newRepo(t, tx)
		claim, err := repo.Claim(ctx, actor, operation, key, fingerprint)
		if err != nil {
			t.Fatal(err)
		}
		other := newRepo(t, &receiptTestTx{})
		if err := other.Complete(ctx, claim, receipt); err == nil {
			t.Fatal("cross-transaction completion accepted")
		}
		for _, field := range []string{"actor", "operation", "key", "fingerprint", "replay"} {
			modified := claim
			switch field {
			case "actor":
				modified.ActorID += "x"
			case "operation":
				modified.Operation += "x"
			case "key":
				modified.Key += "x"
			case "fingerprint":
				modified.Fingerprint = strings.Repeat("0", 64)
			case "replay":
				modified.Replay = true
			}
			if err := repo.Complete(ctx, modified, receipt); err == nil {
				t.Fatalf("modified %s accepted", field)
			}
		}
		if err := repo.Complete(ctx, Claim{}, receipt); err == nil {
			t.Fatal("zero claim accepted")
		}
		for _, invalid := range []json.RawMessage{nil, {}, []byte("null"), []byte("  null\n"), []byte("{"), []byte("{} {} ")} {
			if err := repo.Complete(ctx, claim, invalid); err == nil {
				t.Fatalf("invalid receipt %q accepted", invalid)
			}
		}
		if len(tx.writes) != 0 {
			t.Fatal("invalid completion wrote data")
		}
		if err := repo.Complete(ctx, claim, receipt); err != nil {
			t.Fatalf("valid completion after rejected input: %v", err)
		}
	})

	t.Run("database-errors-and-missing-completion-never-become-success", func(t *testing.T) {
		sentinel := errors.New("injected database failure")
		for _, rows := range [][]receiptTestRow{{noReceiptRow(sentinel)}, {noReceiptRow(pgx.ErrNoRows), noReceiptRow(sentinel)}, {noReceiptRow(pgx.ErrNoRows), noReceiptRow(pgx.ErrNoRows)}, {noReceiptRow(pgx.ErrNoRows), storedReceiptRow(&fingerprint, nil, false)}} {
			tx := &receiptTestTx{rows: rows}
			claim, err := newRepo(t, tx).Claim(ctx, actor, operation, key, fingerprint)
			if err == nil || claim.Receipt != nil || claim.Replay {
				t.Fatalf("failed claim = %+v, %v", claim, err)
			}
		}
		reader, _ := NewCompletedReceiptReader(&receiptTestTx{rows: []receiptTestRow{noReceiptRow(sentinel)}})
		if _, found, err := reader.LookupCompleted(ctx, actor, operation, key, fingerprint); found || !errors.Is(err, sentinel) {
			t.Fatalf("lookup error lost = %v, %v", found, err)
		}
		for _, writeErr := range []error{nil, sentinel} {
			tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, writeErr: writeErr}
			repo := newRepo(t, tx)
			claim, err := repo.Claim(ctx, actor, operation, key, fingerprint)
			if err != nil {
				t.Fatal(err)
			}
			err = repo.Complete(ctx, claim, receipt)
			if err == nil || writeErr != nil && !errors.Is(err, sentinel) {
				t.Fatalf("completion failure = %v", err)
			}
		}
	})
}
