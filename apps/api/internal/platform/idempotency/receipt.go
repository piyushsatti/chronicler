package idempotency

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type Repository interface {
	Claim(ctx context.Context, actorID, operation, key, fingerprint string) (Claim, error)
	Complete(ctx context.Context, claim Claim, receipt json.RawMessage) error
}

type CompletedReceiptReader interface {
	LookupCompleted(ctx context.Context, actorID, operation, key, fingerprint string) (json.RawMessage, bool, error)
}

type Claim struct {
	Replay      bool
	Receipt     json.RawMessage
	ActorID     string
	Operation   string
	Key         string
	Fingerprint string
}

type claimIdentity struct {
	actorID, operation, key, fingerprint string
}

// receiptStore borrows the command's transaction. Authority and immutable
// aggregate ownership must be checked by the command before receipt admission.
type receiptStore struct {
	db     dbgen.DBTX
	claims map[claimIdentity]struct{}
}

type CompletedReceiptStore struct {
	DB dbgen.DBTX
}

var _ Repository = (*receiptStore)(nil)
var _ CompletedReceiptReader = (*CompletedReceiptStore)(nil)

func NewRepository(tx pgx.Tx) (Repository, error) {
	if nilDB(tx) {
		return nil, errors.New("idempotency transaction is required")
	}
	return &receiptStore{db: tx, claims: make(map[claimIdentity]struct{})}, nil
}

func NewCompletedReceiptReader(db dbgen.DBTX) (*CompletedReceiptStore, error) {
	if nilDB(db) {
		return nil, errors.New("completed receipt database is required")
	}
	return &CompletedReceiptStore{DB: db}, nil
}

func nilDB(db dbgen.DBTX) bool {
	if db == nil {
		return true
	}
	v := reflect.ValueOf(db)
	switch v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return v.IsNil()
	default:
		return false
	}
}

const insertReceipt = `INSERT INTO idempotency_keys (endpoint, actor_id, key, fingerprint)
SELECT $2, id, $3, $4 FROM members WHERE public_id = $1::uuid
ON CONFLICT (endpoint, actor_id, key) DO NOTHING
RETURNING fingerprint`

const readReceipt = `SELECT r.fingerprint, r.receipt, r.completed_at IS NOT NULL
FROM idempotency_keys r JOIN members m ON m.id = r.actor_id
WHERE m.public_id = $1::uuid AND r.endpoint = $2 AND r.key = $3`

const completeReceipt = `UPDATE idempotency_keys r
SET receipt = $5::jsonb, completed_at = now()
FROM members m
WHERE m.id = r.actor_id AND m.public_id = $1::uuid AND r.endpoint = $2
AND r.key = $3 AND r.fingerprint = $4 AND r.receipt IS NULL AND r.completed_at IS NULL`

func receiptIdentity(actorID, operation, key, fingerprint string) (claimIdentity, error) {
	if err := Require(key); err != nil {
		return claimIdentity{}, err
	}
	actor, err := uuid.Parse(actorID)
	if err != nil || actor == uuid.Nil {
		return claimIdentity{}, apierr.New(apierr.Invalid, "valid receipt actor required")
	}
	if operation == "" {
		return claimIdentity{}, apierr.New(apierr.Invalid, "receipt operation required")
	}
	for i, c := range operation {
		if !(c == '_' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || i > 0 && c >= '0' && c <= '9') {
			return claimIdentity{}, apierr.New(apierr.Invalid, "invalid receipt operation")
		}
	}
	if len(fingerprint) != 64 || strings.IndexFunc(fingerprint, func(c rune) bool {
		return !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f')
	}) != -1 {
		return claimIdentity{}, apierr.New(apierr.Invalid, "invalid command fingerprint")
	}
	return claimIdentity{actor.String(), operation, key, fingerprint}, nil
}

func (i claimIdentity) args() []any {
	return []any{i.actorID, "graphql:" + i.operation, i.key, i.fingerprint}
}

// Claim relies on the unique index to wait for a competing transaction. The
// separate read after a collision sees its commit under READ COMMITTED, without
// updating a completed row or a mismatched fingerprint.
func (s *receiptStore) Claim(ctx context.Context, actorID, operation, key, fingerprint string) (Claim, error) {
	i, err := receiptIdentity(actorID, operation, key, fingerprint)
	if err != nil {
		return Claim{}, err
	}
	if s == nil || nilDB(s.db) {
		return Claim{}, errors.New("idempotency transaction is required")
	}
	var inserted string
	err = s.db.QueryRow(ctx, insertReceipt, i.args()...).Scan(&inserted)
	claim := Claim{ActorID: i.actorID, Operation: i.operation, Key: i.key, Fingerprint: i.fingerprint}
	if err == nil {
		if inserted != i.fingerprint {
			return Claim{}, errors.New("inserted receipt fingerprint differs")
		}
		s.claims[i] = struct{}{}
		return claim, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Claim{}, fmt.Errorf("claim command receipt: %w", err)
	}
	receipt, found, err := lookupReceipt(ctx, s.db, i, true)
	if err != nil {
		return Claim{}, err
	}
	if !found {
		return Claim{}, errors.New("receipt collision has no completed command")
	}
	claim.Replay, claim.Receipt = true, receipt
	return claim, nil
}

func (s *receiptStore) Complete(ctx context.Context, claim Claim, receipt json.RawMessage) error {
	if s == nil || nilDB(s.db) || claim.Replay {
		return errors.New("completion requires this transaction's new claim")
	}
	i := claimIdentity{claim.ActorID, claim.Operation, claim.Key, claim.Fingerprint}
	if _, ok := s.claims[i]; !ok {
		return errors.New("completion requires this transaction's unmodified claim")
	}
	if !validReceipt(receipt) {
		return errors.New("completed command receipt must be nonnull JSON")
	}
	args := append(i.args(), []byte(receipt))
	result, err := s.db.Exec(ctx, completeReceipt, args...)
	if err != nil {
		return fmt.Errorf("complete command receipt: %w", err)
	}
	if result.RowsAffected() != 1 {
		return errors.New("command receipt is absent or already completed")
	}
	delete(s.claims, i)
	return nil
}

func (s *CompletedReceiptStore) LookupCompleted(ctx context.Context, actorID, operation, key, fingerprint string) (json.RawMessage, bool, error) {
	i, err := receiptIdentity(actorID, operation, key, fingerprint)
	if err != nil {
		return nil, false, err
	}
	if s == nil || nilDB(s.DB) {
		return nil, false, errors.New("completed receipt database is required")
	}
	return lookupReceipt(ctx, s.DB, i, false)
}

func lookupReceipt(ctx context.Context, db dbgen.DBTX, i claimIdentity, lock bool) (json.RawMessage, bool, error) {
	query := readReceipt
	if lock {
		query += " FOR UPDATE OF r"
	}
	var fingerprint *string
	var receipt []byte
	var completed bool
	err := db.QueryRow(ctx, query, i.args()[:3]...).Scan(&fingerprint, &receipt, &completed)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("read command receipt: %w", err)
	}
	if fingerprint == nil && receipt == nil && !completed {
		return nil, false, nil
	}
	if fingerprint != nil && *fingerprint != i.fingerprint {
		return nil, false, ErrConflict
	}
	if fingerprint == nil || !completed || !validReceipt(receipt) {
		return nil, false, errors.New("incomplete or invalid stored command receipt")
	}
	return bytes.Clone(receipt), true, nil
}

func validReceipt(receipt []byte) bool {
	return json.Valid(receipt) && !bytes.Equal(bytes.TrimSpace(receipt), []byte("null"))
}
