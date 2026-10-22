package idempotency

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type receiptCall struct {
	query string
	args  []any
}

func TestCompleteRejectsUnstagedAuthorizationSidecar(t *testing.T) {
	actor := "10000000-0000-4000-8000-000000000004"
	fingerprint := strings.Repeat("a", 64)
	fact := CommandOverrideFact{ActorID: actor, Operation: "Mutation.editPublishedDocument", SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010", RuleCode: "OWNERSHIP", At: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
	matching, err := json.Marshal([]CommandOverrideFact{fact})
	if err != nil {
		t.Fatal(err)
	}
	for _, sidecar := range []string{string(matching), `null`, `[]`, `[null]`, `{}`, `"malformed"`} {
		t.Run(sidecar, func(t *testing.T) {
			tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, affected: 1}
			repo, err := NewRepository(tx)
			if err != nil {
				t.Fatal(err)
			}
			claim, err := repo.Claim(t.Context(), actor, "editPublishedDocument", "boundary-key", fingerprint)
			if err != nil || claim.Replay {
				t.Fatalf("new claim=%+v err=%v", claim, err)
			}
			// No RecordOverride call admitted these supplied metadata bytes.
			result := json.RawMessage(`{"Id":"result","_authorizationOverrides":` + sidecar + `}`)
			if err := repo.Complete(t.Context(), claim, result); err == nil || len(tx.writes) != 0 {
				t.Fatalf("unstaged authorization accepted: err=%v SQL writes=%d", err, len(tx.writes))
			}
			if err := repo.Complete(t.Context(), claim, json.RawMessage(`{"Id":"result"}`)); err != nil || len(tx.writes) != 1 {
				t.Fatalf("rejected collision consumed the live claim: %v writes=%d", err, len(tx.writes))
			}
		})
	}
}

func TestCompletePreservesLegacyNotificationAndStagedMetadataPaths(t *testing.T) {
	actor := "10000000-0000-4000-8000-000000000004"
	fingerprint := strings.Repeat("a", 64)
	// The existing DOCUMENT_EDITED proof shape is opaque to idempotency; its
	// owning notification decoder still validates the typed event and source.
	proofs := json.RawMessage(`[{"notificationId":"10000000-0000-4000-8000-000000000011","recipientId":"10000000-0000-4000-8000-000000000002","payload":{"version":1,"origin":{"actorId":"10000000-0000-4000-8000-000000000004","operation":"editPublishedDocument","key":"boundary-key","fingerprint":"` + fingerprint + `"},"event":{"key":"document-revision","kind":"DOCUMENT_EDITED","subjectType":"document","subjectId":"10000000-0000-4000-8000-000000000010","actorId":"10000000-0000-4000-8000-000000000004","facts":{"version":1,"eventKind":"DOCUMENT_EDITED","revisionId":"10000000-0000-4000-8000-000000000012"},"occurredAt":"2026-10-20T12:00:00Z"},"recipients":["10000000-0000-4000-8000-000000000002"]}}]`)
	for _, result := range []json.RawMessage{[]byte(` {"Id":"result"} `), []byte(` [1,2] `), []byte(`"scalar"`), []byte(`42`), []byte(`true`)} {
		for _, withProof := range []bool{false, true} {
			for _, staged := range []bool{false, true} {
				if (withProof || staged) && bytes.TrimSpace(result)[0] != '{' && bytes.TrimSpace(result)[0] != '[' {
					continue
				}
				t.Run(string(result)+"/proof="+strconv.FormatBool(withProof)+"/staged="+strconv.FormatBool(staged), func(t *testing.T) {
					input := result
					if withProof {
						var err error
						input, err = AppendNotificationProofs(input, proofs)
						if err != nil {
							t.Fatal(err)
						}
					}
					tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, affected: 1}
					repo, err := NewRepository(tx)
					if err != nil {
						t.Fatal(err)
					}
					claim, err := repo.Claim(t.Context(), actor, "editPublishedDocument", "boundary-key", fingerprint)
					if err != nil {
						t.Fatal(err)
					}
					if staged {
						fact := CommandOverrideFact{ActorID: actor, Operation: "Mutation.editPublishedDocument", SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010", RuleCode: "OWNERSHIP", At: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
						if err := repo.RecordOverride(t.Context(), claim, fact); err != nil {
							t.Fatal(err)
						}
					}
					if err := repo.Complete(t.Context(), claim, input); err != nil || len(tx.writes) != 1 {
						t.Fatalf("valid completion=%v writes=%d", err, len(tx.writes))
					}
					stored := tx.writes[0].args[4].([]byte)
					if !staged && !bytes.Equal(stored, input) {
						t.Fatal("no-fact legacy/proof bytes changed")
					}
					reader, _ := NewCompletedReceiptReader(&receiptTestTx{rows: []receiptTestRow{storedReceiptRow(&fingerprint, stored, true)}})
					decoded, found, err := reader.LookupCompleted(t.Context(), actor, claim.Operation, claim.Key, fingerprint)
					var got, want any
					if err != nil || !found || json.Unmarshal(decoded, &got) != nil || json.Unmarshal(input, &want) != nil || !reflect.DeepEqual(got, want) {
						t.Fatalf("result/notification replay changed: %s err=%v", decoded, err)
					}
				})
			}
		}
	}
}

func TestReceiptOverrideClaimOwnershipAndOrderedFacts(t *testing.T) {
	ctx := t.Context()
	actor := "10000000-0000-4000-8000-000000000004"
	fingerprint := strings.Repeat("a", 64)
	tx := &receiptTestTx{rows: []receiptTestRow{insertedReceiptRow(fingerprint)}, affected: 1}
	repo, _ := NewRepository(tx)
	claim, err := repo.Claim(ctx, actor, "setMemberRolesBatch", "exact-key", fingerprint)
	if err != nil {
		t.Fatal(err)
	}
	fact := CommandOverrideFact{ActorID: actor, Operation: "Mutation.setMemberRolesBatch", SubjectType: "member", SubjectID: "10000000-0000-4000-8000-000000000002", RuleCode: "ROLE", At: time.Date(2026, 10, 20, 12, 0, 0, 123000, time.UTC)}
	other, _ := NewRepository(&receiptTestTx{})
	if err := other.RecordOverride(ctx, claim, fact); err == nil {
		t.Fatal("another repository accepted the claim")
	}
	for _, field := range []string{"actor", "operation", "key", "fingerprint", "replay"} {
		changed := claim
		switch field {
		case "actor":
			changed.ActorID = fact.SubjectID
		case "operation":
			changed.Operation += "Other"
		case "key":
			changed.Key += "Other"
		case "fingerprint":
			changed.Fingerprint = strings.Repeat("b", 64)
		case "replay":
			changed.Replay = true
		}
		if err := repo.RecordOverride(ctx, changed, fact); err == nil {
			t.Fatalf("changed %s accepted", field)
		}
	}
	for _, field := range []string{"actor", "operation", "subject-type", "subject-id", "uppercase-id", "nil-id", "rule", "time", "zone", "precision"} {
		changed := fact
		switch field {
		case "actor":
			changed.ActorID = fact.SubjectID
		case "operation":
			changed.Operation = "Mutation.setMemberRoles"
		case "subject-type":
			changed.SubjectType = "HIDDEN_BODY_SENTINEL"
		case "subject-id":
			changed.SubjectID = "HIDDEN_BODY_SENTINEL"
		case "uppercase-id":
			changed.SubjectID = "AAAAAAAA-0000-4000-8000-000000000002"
		case "nil-id":
			changed.SubjectID = "00000000-0000-0000-0000-000000000000"
		case "rule":
			changed.RuleCode = "HIDDEN_BODY_SENTINEL"
		case "time":
			changed.At = time.Time{}
		case "zone":
			changed.At = changed.At.In(time.FixedZone("other", 3600))
		case "precision":
			changed.At = changed.At.Add(time.Nanosecond)
		}
		if err := repo.RecordOverride(ctx, claim, changed); err == nil {
			t.Fatalf("invalid %s accepted", field)
		}
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if err := repo.RecordOverride(canceled, claim, fact); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled staging=%v", err)
	}
	if err := repo.RecordOverride(ctx, claim, fact); err != nil {
		t.Fatal(err)
	}
	second := fact
	second.SubjectID = "10000000-0000-4000-8000-000000000003"
	if err := repo.RecordOverride(ctx, claim, second); err != nil {
		t.Fatal(err)
	}
	if len(tx.writes) != 0 {
		t.Fatal("fact staging wrote SQL")
	}
	result := json.RawMessage(`[{"memberId":"one"},{"memberId":"two"}]`)
	if err := repo.Complete(ctx, claim, result); err != nil {
		t.Fatal(err)
	}
	if len(tx.writes) != 1 {
		t.Fatalf("completion writes=%d", len(tx.writes))
	}
	stored := tx.writes[0].args[4].([]byte)
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(stored, &envelope); err != nil {
		t.Fatal(err)
	}
	var facts []CommandOverrideFact
	if err := StrictJSON(envelope[authorizationOverridesKey], &facts); err != nil || !reflect.DeepEqual(facts, []CommandOverrideFact{fact, second}) {
		t.Fatalf("ordered facts=%+v err=%v", facts, err)
	}
	decoded, err := decodeAuthorizationReceipt(stored, claimIdentity{actor, claim.Operation, claim.Key, fingerprint})
	if err != nil || string(decoded) != string(result) {
		t.Fatalf("array replay=%s err=%v", decoded, err)
	}
	if err := repo.RecordOverride(ctx, claim, fact); err == nil {
		t.Fatal("consumed claim accepted another fact")
	}
}

func TestReceiptMetadataComposesAndPeelsOnlyOwnedSidecar(t *testing.T) {
	actor := "10000000-0000-4000-8000-000000000004"
	identity := claimIdentity{actor, "editPublishedDocument", "key", strings.Repeat("a", 64)}
	fact := CommandOverrideFact{ActorID: actor, Operation: "Mutation.editPublishedDocument", SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010", RuleCode: "OWNERSHIP", At: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
	encoded, _ := json.Marshal([]CommandOverrideFact{fact})
	proofs := json.RawMessage(`[{"proof":"typed-validation-belongs-to-notification"}]`)
	for _, result := range []json.RawMessage{[]byte(`{"Id":"result"}`), []byte(`[{"Id":"result"}]`)} {
		for _, notificationFirst := range []bool{true, false} {
			var stored json.RawMessage
			var err error
			if notificationFirst {
				stored, err = AppendNotificationProofs(result, proofs)
				if err == nil {
					stored, err = appendReceiptMetadata(stored, authorizationOverridesKey, encoded)
				}
			} else {
				stored, err = appendReceiptMetadata(result, authorizationOverridesKey, encoded)
				if err == nil {
					stored, err = AppendNotificationProofs(stored, proofs)
				}
			}
			if err != nil {
				t.Fatal(err)
			}
			intermediate, err := decodeAuthorizationReceipt(stored, identity)
			if err != nil || !bytes.Contains(intermediate, []byte(notificationProofsKey)) || bytes.Contains(intermediate, []byte(authorizationOverridesKey)) {
				t.Fatalf("base discarded proof or exposed override: %s %v", intermediate, err)
			}
			if result[0] == '[' && !bytes.Contains(intermediate, []byte(notificationResultKey)) {
				t.Fatal("base unwrapped array before proof validation")
			}
			final, gotProofs, err := PeelNotificationProofs(intermediate)
			var got, want any
			_ = json.Unmarshal(final, &got)
			_ = json.Unmarshal(result, &want)
			if err != nil || !reflect.DeepEqual(got, want) || string(gotProofs) != string(proofs) {
				t.Fatalf("composed replay=%s proofs=%s err=%v", final, gotProofs, err)
			}
			notificationPeeled, _, err := PeelNotificationProofs(stored)
			if err != nil || !bytes.Contains(notificationPeeled, []byte(authorizationOverridesKey)) {
				t.Fatal("notification discarded authorization metadata")
			}
			final, err = decodeAuthorizationReceipt(notificationPeeled, identity)
			_ = json.Unmarshal(final, &got)
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("opposite peel order=%s %v", final, err)
			}
		}
	}
	for _, legacy := range []json.RawMessage{[]byte(` {"old":true} `), []byte(` [1,2] `), []byte(`"scalar"`), []byte(`42`), []byte(`true`)} {
		got, err := decodeAuthorizationReceipt(legacy, identity)
		if err != nil || string(got) != string(legacy) {
			t.Fatalf("legacy result changed: %s %v", got, err)
		}
	}
	for _, result := range []json.RawMessage{[]byte(`{"_authorizationOverrides":null}`), []byte(`{"_notificationResult":[]}`), []byte(`{"_notificationProofs":null}`), []byte(`{"Id":1,"Id":2}`), []byte(`42`)} {
		if _, err := appendReceiptMetadata(result, authorizationOverridesKey, encoded); err == nil {
			t.Fatalf("invalid/colliding result accepted: %s", result)
		}
	}
	for _, pair := range [][2]string{{"site", "home_banner"}, {"site", "quest_announcement_role"}, {"spatial", "game-calendar"}} {
		changed := fact
		changed.SubjectType, changed.SubjectID = pair[0], pair[1]
		if err := validateOverrideFact(changed, identity); err != nil {
			t.Fatalf("canonical singleton=%v %v", pair, err)
		}
		changed.SubjectType = "document"
		if err := validateOverrideFact(changed, identity); err == nil {
			t.Fatal("singleton accepted for wrong subject type")
		}
	}
}

func TestStoredOverrideMetadataIsStrictAndBoundToActualReceiptRow(t *testing.T) {
	actor := "10000000-0000-4000-8000-000000000004"
	fingerprint := strings.Repeat("a", 64)
	fact := CommandOverrideFact{ActorID: actor, Operation: "Mutation.editPublishedDocument", SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010", RuleCode: "OWNERSHIP", At: time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)}
	facts, _ := json.Marshal([]CommandOverrideFact{fact})
	for _, corrupted := range []string{
		`null`, `[]`, `[null]`, `[{}]`,
		strings.Replace(string(facts), `"actorId":"`+actor+`"`, `"actorId":"10000000-0000-4000-8000-000000000003"`, 1),
		strings.Replace(string(facts), `Mutation.editPublishedDocument`, `Mutation.publishDocument`, 1),
		strings.Replace(string(facts), `"ruleCode":"OWNERSHIP"`, `"ruleCode":"AUDIENCE","ruleCode":"OWNERSHIP"`, 1),
		strings.Replace(string(facts), `"ruleCode":`, `"secret":"HIDDEN_BODY_SENTINEL","ruleCode":`, 1),
		strings.Replace(string(facts), `"actorId":`, `"ActorId":`, 1),
		strings.Replace(string(facts), `"at":"2026-10-20T12:00:00Z"`, `"at":null`, 1),
		strings.Replace(string(facts), `"at":"2026-10-20T12:00:00Z"`, `"at":"not-an-instant"`, 1),
		strings.Replace(string(facts), `"at":"2026-10-20T12:00:00Z"`, `"at":"2026-10-20T13:00:00+01:00"`, 1),
	} {
		stored := []byte(`{"Id":"result","_authorizationOverrides":` + corrupted + `}`)
		for _, replay := range []bool{false, true} {
			tx := &receiptTestTx{}
			if replay {
				tx.rows = append(tx.rows, noReceiptRow(pgx.ErrNoRows))
			}
			tx.rows = append(tx.rows, storedReceiptRow(&fingerprint, stored, true))
			if replay {
				repo, _ := NewRepository(tx)
				claim, err := repo.Claim(t.Context(), actor, "editPublishedDocument", "key", fingerprint)
				if err == nil || claim.Replay || claim.Receipt != nil {
					t.Fatalf("corrupt replay exposed result: %s %+v %v", corrupted, claim, err)
				}
			} else {
				reader, _ := NewCompletedReceiptReader(tx)
				got, found, err := reader.LookupCompleted(t.Context(), actor, "editPublishedDocument", "key", fingerprint)
				if err == nil || found || got != nil {
					t.Fatalf("corrupt lookup exposed result: %s %s %v %v", corrupted, got, found, err)
				}
			}
			if len(tx.writes) != 0 {
				t.Fatal("corrupt replay wrote SQL")
			}
		}
	}
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
