package notification

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const maxNotificationPayloadBytes = 256 << 10

type commandOrigin struct {
	ActorID     string `json:"actorId"`
	Operation   string `json:"operation"`
	Key         string `json:"key"`
	Fingerprint string `json:"fingerprint"`
}

type inboxPayload struct {
	Version    int32         `json:"version"`
	Origin     commandOrigin `json:"origin"`
	Event      Event         `json:"event"`
	Recipients []string      `json:"recipients"`
}

type inboxProof struct {
	NotificationID string       `json:"notificationId"`
	RecipientID    string       `json:"recipientId"`
	Payload        inboxPayload `json:"payload"`
}

type producerReceipt struct {
	idempotency.Repository
	store *ProductPostgres
}

// NewCommandProducer binds the proof buffer and replay repository to one UOW.
func NewCommandProducer(tx pgx.Tx, replay idempotency.Repository, recipients RecipientComposition) (ProducerRepos, idempotency.Repository, error) {
	if product.MissingDependency(tx) || product.MissingDependency(replay) {
		return ProducerRepos{}, nil, errors.New("notification command transaction and replay required")
	}
	store, err := NewProductPostgres(tx)
	if err != nil {
		return ProducerRepos{}, nil, err
	}
	return ProducerRepos{Writer: store, Preferences: store, Recipients: recipients}, &producerReceipt{Repository: replay, store: store}, nil
}

func (r *producerReceipt) Claim(ctx context.Context, actorID, operation, key, fingerprint string) (idempotency.Claim, error) {
	claim, err := r.Repository.Claim(ctx, actorID, operation, key, fingerprint)
	if err != nil {
		return claim, err
	}
	if claim.Replay {
		claim.Receipt, err = DecodeCommandReceipt(claim.Receipt)
		return claim, err
	}
	if r.store.origin != nil {
		return idempotency.Claim{}, errors.New("notification producer already has a command claim")
	}
	r.store.origin = &commandOrigin{ActorID: claim.ActorID, Operation: claim.Operation, Key: claim.Key, Fingerprint: claim.Fingerprint}
	return claim, nil
}

func (r *producerReceipt) Complete(ctx context.Context, claim idempotency.Claim, result json.RawMessage) error {
	if r.store.origin == nil || *r.store.origin != (commandOrigin{ActorID: claim.ActorID, Operation: claim.Operation, Key: claim.Key, Fingerprint: claim.Fingerprint}) {
		return errors.New("notification producer has an incomplete or different command")
	}
	if len(r.store.proofs) == 0 {
		return r.Repository.Complete(ctx, claim, result)
	}
	stored, err := appendNotificationProofs(result, r.store.proofs)
	if err != nil {
		return err
	}
	return r.Repository.Complete(ctx, claim, stored)
}

func appendNotificationProofs(result json.RawMessage, proofs []inboxProof) (json.RawMessage, error) {
	encoded, err := json.Marshal(proofs)
	if err != nil {
		return nil, opaqueNotificationProofError(err)
	}
	stored, err := idempotency.AppendNotificationProofs(result, encoded)
	if err != nil {
		return nil, opaqueNotificationProofError(err)
	}
	return stored, nil
}

// DecodeCommandReceipt preserves result shape after validating the owning proof.
func DecodeCommandReceipt(receipt json.RawMessage) (json.RawMessage, error) {
	result, proofJSON, err := idempotency.PeelNotificationProofs(receipt)
	if err != nil {
		return nil, opaqueNotificationProofError(err)
	}
	if proofJSON == nil {
		return result, nil
	}
	var proofs []inboxProof
	if err := strictNotificationJSON(proofJSON, &proofs); err != nil {
		return nil, err
	}
	if len(proofs) == 0 {
		return nil, opaqueNotificationProofError(errors.New("empty notification proof list"))
	}
	for _, proof := range proofs {
		if !canonicalNotificationID(proof.NotificationID) || !canonicalNotificationID(proof.RecipientID) || validatePayload(proof.Payload) != nil {
			return nil, opaqueNotificationProofError(errors.New("invalid notification proof entry"))
		}
	}
	return result, nil
}

func validatePayload(payload inboxPayload) error {
	if !validNotificationOrigin(payload) {
		return opaqueNotificationProofError(errors.New("invalid notification origin"))
	}
	if err := validateEvent(payload.Event); err != nil {
		return opaqueNotificationProofError(err)
	}
	if !validNotificationRecipients(payload.Recipients) {
		return opaqueNotificationProofError(errors.New("invalid notification recipients"))
	}
	var addressed []string
	switch payload.Event.Kind {
	case DMMentioned:
		addressed = payload.Event.Facts.NewMentionMemberIDs
	case QuestScheduled:
		addressed = payload.Event.Facts.RecipientMemberIDs
	}
	if addressed != nil {
		expected := make([]string, 0, len(addressed))
		for _, id := range addressed {
			if !canonicalNotificationID(id) {
				return opaqueNotificationProofError(errors.New("invalid addressed member id"))
			}
			if id != payload.Event.ActorID {
				expected = append(expected, id)
			}
		}
		slices.Sort(expected)
		expected = slices.Compact(expected)
		if !slices.Equal(expected, payload.Recipients) {
			return opaqueNotificationProofError(errors.New("recipients do not match addressed members"))
		}
	}
	return nil
}

func validNotificationOrigin(payload inboxPayload) bool {
	return payload.Version == 1 && canonicalNotificationID(payload.Origin.ActorID) && payload.Origin.ActorID == payload.Event.ActorID && strings.TrimSpace(payload.Origin.Key) != "" && payload.Origin.Operation != "" && len(payload.Origin.Fingerprint) == 64 && len(payload.Recipients) > 0
}

func validNotificationRecipients(recipients []string) bool {
	for i, id := range recipients {
		if !canonicalNotificationID(id) || i > 0 && recipients[i-1] >= id {
			return false
		}
	}
	return true
}

func strictNotificationJSON(raw []byte, target any) error {
	if err := idempotency.StrictJSON(raw, target); err != nil {
		return opaqueNotificationProofError(err)
	}
	return nil
}

func samePayload(a, b inboxPayload) bool { return reflect.DeepEqual(a, b) }
