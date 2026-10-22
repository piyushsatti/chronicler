package notification

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
)

type receiptTestTx struct{ pgx.Tx }
type proofReceiptRepository struct {
	replay  bool
	receipt json.RawMessage
	err     error
}

func (r *proofReceiptRepository) Claim(_ context.Context, actor, operation, key, fingerprint string) (idempotency.Claim, error) {
	return idempotency.Claim{ActorID: actor, Operation: operation, Key: key, Fingerprint: fingerprint, Replay: r.replay, Receipt: r.receipt}, r.err
}

func (r *proofReceiptRepository) RecordOverride(context.Context, idempotency.Claim, idempotency.CommandOverrideFact) error {
	return r.err
}

func (r *proofReceiptRepository) Complete(_ context.Context, _ idempotency.Claim, receipt json.RawMessage) error {
	r.receipt = append(json.RawMessage(nil), receipt...)
	return r.err
}

func testInboxProof() inboxProof {
	event := producerInput(QuestSignupConfirmed)
	return inboxProof{NotificationID: producerEvent, RecipientID: producerA, Payload: inboxPayload{
		Version: 1,
		Origin:  commandOrigin{ActorID: event.ActorID, Operation: "signupForQuest", Key: "signup-key", Fingerprint: strings.Repeat("a", 64)},
		Event:   event, Recipients: []string{producerA},
	}}
}

func TestCommandProducerReceiptsKeepObjectArrayAndReplayResults(t *testing.T) {
	for _, result := range []json.RawMessage{[]byte(`{"Id":"quest","rewardCoverage":"COMPLETE"}`), []byte(`[{"Id":"participant"}]`)} {
		repository := &proofReceiptRepository{}
		notice, replay, err := NewCommandProducer(&receiptTestTx{}, repository, RecipientComposition{})
		if err != nil {
			t.Fatal(err)
		}
		proof := testInboxProof()
		origin := proof.Payload.Origin
		claim, err := replay.Claim(context.Background(), origin.ActorID, origin.Operation, origin.Key, origin.Fingerprint)
		if err != nil {
			t.Fatal(err)
		}
		notice.Writer.(*ProductPostgres).proofs = []inboxProof{proof}
		if err := replay.Complete(context.Background(), claim, result); err != nil {
			t.Fatal(err)
		}
		var stored map[string]json.RawMessage
		if err := json.Unmarshal(repository.receipt, &stored); err != nil || stored["_notificationProofs"] == nil {
			t.Fatalf("durable proof missing: %s, %v", repository.receipt, err)
		}
		if result[0] == '{' && (string(stored["Id"]) != `"quest"` || string(stored["rewardCoverage"]) != `"COMPLETE"`) {
			t.Fatal("command receipt fields changed")
		}
		repository.replay = true
		_, replay, _ = NewCommandProducer(&receiptTestTx{}, repository, RecipientComposition{})
		claim, err = replay.Claim(context.Background(), origin.ActorID, origin.Operation, origin.Key, origin.Fingerprint)
		var got, want any
		_ = json.Unmarshal(claim.Receipt, &got)
		_ = json.Unmarshal(result, &want)
		if err != nil || !claim.Replay || !reflect.DeepEqual(got, want) {
			t.Fatalf("replay=%s error=%v want=%s", claim.Receipt, err, result)
		}
	}
}

func TestCommandProducerKeepsNonProducingReceiptsAndErrors(t *testing.T) {
	repository := &proofReceiptRepository{}
	_, replay, _ := NewCommandProducer(&receiptTestTx{}, repository, RecipientComposition{})
	origin := testInboxProof().Payload.Origin
	claim, _ := replay.Claim(context.Background(), origin.ActorID, origin.Operation, origin.Key, origin.Fingerprint)
	result := json.RawMessage(" [ {\"Id\": 1} ] ")
	if err := replay.Complete(context.Background(), claim, result); err != nil || string(repository.receipt) != string(result) {
		t.Fatalf("non-producing receipt changed: %s, %v", repository.receipt, err)
	}
	failure := errors.New("receipt failure")
	repository.err = failure
	if _, err := replay.Claim(context.Background(), origin.ActorID, origin.Operation, origin.Key, origin.Fingerprint); !errors.Is(err, failure) {
		t.Fatal("claim dependency failure lost")
	}
	if _, err := appendNotificationProofs([]byte(`{"_notificationProofs":null}`), []inboxProof{testInboxProof()}); err == nil {
		t.Fatal("reserved receipt field collision accepted")
	}
	if _, err := appendNotificationProofs([]byte(`{"_notificationResult":[]}`), []inboxProof{testInboxProof()}); err == nil {
		t.Fatal("reserved result field collision accepted")
	}
}

func TestNotificationDecoderPreservesAuthorizationUntilItsOwnerPeelsIt(t *testing.T) {
	proofs, _ := json.Marshal([]inboxProof{testInboxProof()})
	authorization := json.RawMessage(`[{"actorId":"10000000-0000-4000-8000-000000000004","operation":"Mutation.editPublishedDocument","subjectType":"document","subjectId":"10000000-0000-4000-8000-000000000010","ruleCode":"OWNERSHIP","at":"2026-10-20T12:00:00Z"}]`)
	for _, result := range []json.RawMessage{[]byte(`{"Id":"document"}`), []byte(`[{"Id":"document"}]`)} {
		object := map[string]json.RawMessage{"_authorizationOverrides": authorization, "_notificationProofs": proofs}
		if result[0] == '[' {
			object["_notificationResult"] = result
		} else {
			object["Id"] = json.RawMessage(`"document"`)
		}
		stored, _ := json.Marshal(object)
		peeled, err := DecodeCommandReceipt(stored)
		if err != nil {
			t.Fatal(err)
		}
		var intermediate map[string]json.RawMessage
		if err := json.Unmarshal(peeled, &intermediate); err != nil || intermediate["_authorizationOverrides"] == nil || intermediate["_notificationProofs"] != nil {
			t.Fatalf("wrong owner peeled metadata: %s %v", peeled, err)
		}
		if result[0] == '[' && intermediate["_notificationResult"] == nil {
			t.Fatal("array unwrapped before authorization validation")
		}
		// The owning proof's strict typed validation is still required even when
		// the same receipt also contains valid authorization metadata.
		object["_notificationProofs"] = json.RawMessage(`[{"notificationId":"corrupt"}]`)
		stored, _ = json.Marshal(object)
		if _, err := DecodeCommandReceipt(stored); err == nil {
			t.Fatal("mixed receipt skipped typed proof validation")
		}
	}
}

func TestInboxPayloadStrictlyRejectsCorruptAndRetiredFacts(t *testing.T) {
	encoded, _ := json.Marshal(testInboxProof().Payload)
	for _, raw := range []string{
		string(encoded) + `{}`,
		strings.Replace(string(encoded), `"version":1`, `"version":1,"version":1`, 1),
		strings.Replace(string(encoded), `"version":1`, `"version":1,"ver\u0073ion":1`, 1),
		strings.Replace(string(encoded), `"version":1`, `"Version":1`, 1),
		strings.Replace(string(encoded), `"eventKind":`, `"questChangeId":null,"eventKind":`, 1),
		strings.Replace(string(encoded), `"eventKind":`, `"revisionId":null,"eventKind":`, 1),
		strings.Replace(string(encoded), `"actorId":`, `"secret":"private","actorId":`, 1),
		strings.Repeat("x", maxNotificationPayloadBytes+1),
	} {
		var payload inboxPayload
		if err := strictNotificationJSON([]byte(raw), &payload); err == nil {
			t.Fatalf("malformed payload accepted: %.100s", raw)
		}
	}
	var payload inboxPayload
	if err := strictNotificationJSON(encoded, &payload); err != nil || validatePayload(payload) != nil {
		t.Fatalf("valid payload rejected: %v", err)
	}
}

func TestHistoricalQuestProofUsesImmutableTransitionAfterRosterChanges(t *testing.T) {
	proof := testInboxProof()
	source := sourceProof{SubjectExists: true, CharacterID: producerPointer(producerCharacter), CharacterOwnerID: producerPointer(producerA), ParticipantExists: true}
	if err := validateSourceProof(proof.Payload, source); err != nil {
		t.Fatal(err)
	}
	source.CharacterOwnerID = producerPointer(producerB)
	if err := validateSourceProof(proof.Payload, source); err == nil {
		t.Fatal("foreign owner proof accepted")
	}
	source.CharacterOwnerID = producerPointer(producerA)
	source.ParticipantExists = false
	if err := validateSourceProof(proof.Payload, source); err == nil {
		t.Fatal("missing original participation accepted")
	}
}

func TestCommandReceiptReplaysFullQuestRecipientSnapshot(t *testing.T) {
	proof := testInboxProof()
	proof.Payload.Event.Kind = QuestScheduled
	proof.Payload.Event.Facts = Facts{Version: 1, EventKind: QuestScheduled, ChangedFields: []string{"scheduledAt"}}
	proof.Payload.Event.ActorID = producerC
	proof.Payload.Origin.ActorID = producerC
	proof.Payload.Recipients = make([]string, 100)
	for i := range proof.Payload.Recipients {
		proof.Payload.Recipients[i] = fmt.Sprintf("90000000-0000-4000-8000-%012d", i+1)
	}
	proof.Payload.Event.Facts.RecipientMemberIDs = proof.Payload.Recipients
	proofs := make([]inboxProof, 100)
	for i := range proofs {
		proofs[i] = proof
		proofs[i].RecipientID = proof.Payload.Recipients[i]
		proofs[i].NotificationID = fmt.Sprintf("80000000-0000-4000-8000-%012d", i+1)
	}
	stored, err := appendNotificationProofs([]byte(`{"Id":"quest"}`), proofs)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeCommandReceipt(stored)
	if err != nil || string(decoded) != `{"Id":"quest"}` {
		t.Fatalf("full snapshot receipt replay=%s error=%v", decoded, err)
	}
}
