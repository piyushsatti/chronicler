package notification

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type storedNotification struct {
	ID          string
	Kind        EventKind
	SubjectType string
	SubjectID   string
	Body        string
	CreatedAt   time.Time
	ReadAt      pgtype.Timestamptz
}

type proofRequest struct {
	NotificationID string  `json:"notification_id"`
	ActorID        string  `json:"actor_id"`
	Operation      string  `json:"operation"`
	Key            string  `json:"key"`
	Fingerprint    string  `json:"fingerprint"`
	CharacterID    *string `json:"character_id"`
	VerificationID *string `json:"verification_id"`
	RevisionID     *string `json:"revision_id"`
}

type sourceProof struct {
	SubjectCode              *string    `json:"subjectCode"`
	DocumentAuthorID         *string    `json:"documentAuthorId"`
	SubjectExists            bool       `json:"subjectExists"`
	CharacterID              *string    `json:"characterId"`
	CharacterOwnerID         *string    `json:"characterOwnerId"`
	ParticipantExists        bool       `json:"participantExists"`
	VerificationID           *string    `json:"verificationId"`
	VerificationCharacterID  *string    `json:"verificationCharacterId"`
	Verdict                  *string    `json:"verdict"`
	DeciderID                *string    `json:"deciderId"`
	VerificationAt           *time.Time `json:"verificationAt"`
	RevisionID               *string    `json:"revisionId"`
	RevisionDocumentID       *string    `json:"revisionDocumentId"`
	RevisionActorID          *string    `json:"revisionActorId"`
	RevisionAt               *time.Time `json:"revisionAt"`
	RevisionMentionMemberIDs []string   `json:"revisionMentionMemberIds"`
}

func (p *ProductPostgres) ReadPreferences(ctx context.Context, ids []string) ([]Preferences, error) {
	parsed := make([]pgtype.UUID, len(ids))
	for i, id := range ids {
		if !canonicalNotificationID(id) {
			return nil, errors.New("invalid preference member identity")
		}
		parsed[i], _ = db.ParseUUID(id)
	}
	rows, err := p.queries().ProductNotificationPreferences(ctx, parsed)
	if err != nil {
		return nil, err
	}
	preferences := make([]Preferences, len(rows))
	for i, row := range rows {
		preferences[i] = Preferences{MemberID: db.UUIDString(row)}
	}
	return preferences, nil
}

func (p *ProductPostgres) InsertInbox(ctx context.Context, event Event, ids []string) error {
	if err := p.validateInboxEvent(event); err != nil {
		return err
	}
	at := event.OccurredAt
	payload := inboxPayload{Version: 1, Origin: *p.origin, Event: event, Recipients: append([]string(nil), ids...)}
	if err := validatePayload(payload); err != nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil || len(body) > maxNotificationPayloadBytes {
		return errors.New("invalid notification payload")
	}
	members := notificationMemberUUIDs(ids)
	subject, _ := db.ParseUUID(event.SubjectID)
	rows, err := p.queries().ProductNotificationInsertInbox(ctx, dbgen.ProductNotificationInsertInboxParams{
		Kind: string(event.Kind), SubjectType: event.SubjectType, SubjectID: subject,
		Body: string(body), CreatedAt: pgtype.Timestamptz{Time: at, Valid: true}, MemberIds: members,
	})
	if err != nil {
		return err
	}
	if len(rows) != len(ids) {
		return errors.New("notification insertion lost an addressed member")
	}
	seen := make(map[string]bool, len(rows))
	for _, row := range rows {
		id, recipient := db.UUIDString(row.PublicID), db.UUIDString(row.RecipientID)
		if !canonicalNotificationID(id) || !slices.Contains(ids, recipient) || seen[recipient] {
			return errors.New("notification insertion returned a foreign or duplicate recipient")
		}
		seen[recipient] = true
		p.proofs = append(p.proofs, inboxProof{NotificationID: id, RecipientID: recipient, Payload: payload})
	}
	first := rows[0]
	requests := []proofRequest{notificationProofRequest(db.UUIDString(first.PublicID), payload)}
	proofRows, err := p.readProofRows(ctx, db.UUIDString(first.RecipientID), requests)
	if err != nil {
		return opaqueNotificationProofError(err)
	}
	if len(proofRows) != 1 {
		return opaqueNotificationProofError(errors.New("notification proof row count mismatch"))
	}
	var source sourceProof
	if err := strictNotificationJSON(proofRows[0].SourceProof, &source); err != nil {
		return err
	}
	if err := validateSourceProof(payload, source); err != nil {
		return err
	}
	return nil
}

func notificationMemberUUIDs(ids []string) []pgtype.UUID {
	members := make([]pgtype.UUID, len(ids))
	for i, id := range ids {
		members[i], _ = db.ParseUUID(id)
	}
	return members
}

func (p *ProductPostgres) validateInboxEvent(event Event) error {
	if p.origin == nil || p.origin.ActorID != event.ActorID {
		return errors.New("notification requires the originating command claim")
	}
	if err := validateEvent(event); err != nil {
		return err
	}
	for _, proof := range p.proofs {
		if proof.Payload.Event.Key == event.Key {
			return errors.New("duplicate notification key in command")
		}
	}
	return nil
}

func notificationProofRequest(id string, payload inboxPayload) proofRequest {
	f := payload.Event.Facts
	return proofRequest{NotificationID: id, ActorID: payload.Origin.ActorID, Operation: payload.Origin.Operation, Key: payload.Origin.Key, Fingerprint: payload.Origin.Fingerprint, CharacterID: f.CharacterID, VerificationID: f.VerificationID, RevisionID: f.RevisionID}
}

func (p *ProductPostgres) readProofRows(ctx context.Context, memberID string, requests []proofRequest) ([]dbgen.ProductNotificationProofsRow, error) {
	parsed, err := db.ParseUUID(memberID)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(requests)
	if err != nil {
		return nil, err
	}
	return p.queries().ProductNotificationProofs(ctx, dbgen.ProductNotificationProofsParams{MemberID: parsed, Requests: encoded})
}

func (p *ProductPostgres) proveNotifications(ctx context.Context, memberID string, rows []storedNotification) ([]SubjectProjection, error) {
	projections := make([]SubjectProjection, len(rows))
	if len(rows) == 0 {
		return projections, nil
	}
	if len(rows) > maxAckLimit {
		return nil, opaqueNotificationProofError(errors.New("notification proof batch exceeds limit"))
	}
	payloads, requests, err := notificationProofRequests(memberID, rows)
	if err != nil {
		return nil, err
	}
	proofRows, err := p.readProofRows(ctx, memberID, requests)
	if err != nil {
		return nil, opaqueNotificationProofError(err)
	}
	if len(proofRows) != len(rows) {
		return nil, opaqueNotificationProofError(errors.New("notification proof row count mismatch"))
	}
	byID, err := uniqueNotificationProofRows(proofRows)
	if err != nil {
		return nil, err
	}
	for i, row := range rows {
		projection, err := proveStoredNotification(memberID, row, payloads[i], byID)
		if err != nil {
			return nil, err
		}
		projections[i] = projection
	}
	return projections, nil
}

func notificationProofRequests(memberID string, rows []storedNotification) ([]inboxPayload, []proofRequest, error) {
	payloads := make([]inboxPayload, len(rows))
	requests := make([]proofRequest, len(rows))
	for i, row := range rows {
		payload := &payloads[i]
		if !canonicalNotificationID(row.ID) || len(row.Body) > maxNotificationPayloadBytes || strictNotificationJSON([]byte(row.Body), payload) != nil || validatePayload(*payload) != nil || row.Kind != payload.Event.Kind || row.SubjectType != payload.Event.SubjectType || (row.SubjectID != "" && row.SubjectID != payload.Event.SubjectID) || !row.CreatedAt.Equal(payload.Event.OccurredAt) || !slices.Contains(payload.Recipients, memberID) {
			return nil, nil, opaqueNotificationProofError(errors.New("stored notification failed proof request checks"))
		}
		requests[i] = notificationProofRequest(row.ID, *payload)
	}
	return payloads, requests, nil
}

func uniqueNotificationProofRows(rows []dbgen.ProductNotificationProofsRow) (map[string]dbgen.ProductNotificationProofsRow, error) {
	byID := make(map[string]dbgen.ProductNotificationProofsRow, len(rows))
	for _, row := range rows {
		id := db.UUIDString(row.NotificationID)
		if _, duplicate := byID[id]; duplicate {
			return nil, opaqueNotificationProofError(errors.New("duplicate notification proof row"))
		}
		byID[id] = row
	}
	return byID, nil
}

func proveStoredNotification(memberID string, row storedNotification, payload inboxPayload, byID map[string]dbgen.ProductNotificationProofsRow) (SubjectProjection, error) {
	proofRow, ok := byID[row.ID]
	if !ok {
		return SubjectProjection{}, opaqueNotificationProofError(errors.New("notification proof row missing"))
	}
	var proofs []inboxProof
	if err := strictNotificationJSON(proofRow.CommandProofs, &proofs); err != nil {
		return SubjectProjection{}, err
	}
	found := false
	for _, proof := range proofs {
		if proof.NotificationID != row.ID {
			continue
		}
		if found || proof.RecipientID != memberID || !samePayload(proof.Payload, payload) {
			return SubjectProjection{}, opaqueNotificationProofError(errors.New("notification command proof mismatch"))
		}
		found = true
	}
	var source sourceProof
	if !found || strictNotificationJSON(proofRow.SourceProof, &source) != nil || validateSourceProof(payload, source) != nil {
		return SubjectProjection{}, opaqueNotificationProofError(errors.New("notification source proof failed"))
	}
	label := notificationLabel(payload.Event)
	return SubjectProjection{SubjectType: row.SubjectType, SubjectID: payload.Event.SubjectID, Visible: source.SubjectExists, Code: source.SubjectCode, Label: label, Title: &label, Facts: payload.Event.Facts}, nil
}

func validateSourceProof(payload inboxPayload, source sourceProof) error {
	event := payload.Event
	same := func(value *string, expected string) bool { return value != nil && *value == expected }
	at := func(value *time.Time) bool { return value != nil && value.Equal(event.OccurredAt) }
	switch event.Kind {
	case CharacterVerificationDecided:
		return validateVerificationSourceProof(payload, source, same, at)
	case QuestSignupConfirmed, QuestWaitlistPromoted:
		return validateQuestSourceProof(payload, source, same)
	case DocumentEdited, DocumentPublished, DMMentioned:
		return validateDocumentSourceProof(payload, source, same, at)
	case QuestScheduled:
		if !source.SubjectExists {
			return opaqueNotificationProofError(errors.New("quest scheduled subject missing"))
		}
	default:
		return opaqueNotificationProofError(errors.New("unsupported notification source proof kind"))
	}
	return nil
}

func validateVerificationSourceProof(payload inboxPayload, source sourceProof, same func(*string, string) bool, at func(*time.Time) bool) error {
	event, facts := payload.Event, payload.Event.Facts
	if !source.SubjectExists || !same(source.VerificationID, *facts.VerificationID) || !same(source.VerificationCharacterID, event.SubjectID) || !same(source.Verdict, *facts.Verdict) || !same(source.DeciderID, event.ActorID) || !at(source.VerificationAt) || source.CharacterOwnerID == nil || !slices.Equal(payload.Recipients, []string{*source.CharacterOwnerID}) {
		return opaqueNotificationProofError(errors.New("verification source proof mismatch"))
	}
	return nil
}

func validateQuestSourceProof(payload inboxPayload, source sourceProof, same func(*string, string) bool) error {
	facts := payload.Event.Facts
	if !source.SubjectExists || !source.ParticipantExists || !same(source.CharacterID, *facts.CharacterID) || source.CharacterOwnerID == nil || !slices.Equal(payload.Recipients, []string{*source.CharacterOwnerID}) {
		return opaqueNotificationProofError(errors.New("quest source proof mismatch"))
	}
	return nil
}

func validateDocumentSourceProof(payload inboxPayload, source sourceProof, same func(*string, string) bool, at func(*time.Time) bool) error {
	event, facts := payload.Event, payload.Event.Facts
	if !same(source.RevisionID, *facts.RevisionID) || !same(source.RevisionDocumentID, event.SubjectID) || !same(source.RevisionActorID, event.ActorID) || !at(source.RevisionAt) {
		return opaqueNotificationProofError(errors.New("document source proof mismatch"))
	}
	if event.Kind == DMMentioned {
		recorded := slices.Clone(source.RevisionMentionMemberIDs)
		slices.Sort(recorded)
		if !slices.Equal(recorded, facts.NewMentionMemberIDs) {
			return opaqueNotificationProofError(errors.New("document mention proof mismatch"))
		}
		return nil
	}
	if source.DocumentAuthorID == nil || !slices.Equal(payload.Recipients, []string{*source.DocumentAuthorID}) || *source.DocumentAuthorID == event.ActorID {
		return opaqueNotificationProofError(errors.New("document author proof mismatch"))
	}
	return nil
}

func notificationLabel(event Event) string {
	switch event.Kind {
	case CharacterVerificationDecided:
		return "Character verification " + *event.Facts.Verdict
	case QuestSignupConfirmed:
		if *event.Facts.ToStatus == "waitlisted" {
			return "Quest waitlist signup confirmed"
		}
		return "Quest signup confirmed"
	case QuestWaitlistPromoted:
		if *event.Facts.ToStatus == "waitlisted" {
			return "Moved to the waitlist"
		}
		return "Quest waitlist promoted"
	case DocumentEdited:
		return "Document edited"
	case DocumentPublished:
		return "Document published"
	case DMMentioned:
		return "You were mentioned in a document"
	case QuestScheduled:
		return "Quest schedule updated"
	}
	return ""
}
