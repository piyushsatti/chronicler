package notification

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Producer struct{}

func NewProducer() *Producer { return &Producer{} }

func (p *Producer) Record(ctx context.Context, repos ProducerRepos, event Event) error {
	if p == nil || repos.Writer == nil || repos.Preferences == nil {
		return errors.New("notification producer dependencies unavailable")
	}
	if err := validateEvent(event); err != nil {
		return err
	}
	if err := normalizeMentionRecipients(&event); err != nil {
		return err
	}
	recipients, excludeActor, err := eventRecipients(ctx, repos.Recipients, event)
	if err != nil {
		return err
	}
	ids, err := addressedNotificationRecipients(recipients, excludeActor, event.ActorID)
	if err != nil {
		return err
	}
	if len(ids) > 0 {
		preferences, err := repos.Preferences.ReadPreferences(ctx, append([]string(nil), ids...))
		if err != nil {
			return err
		}
		if err := validateAddressedPreferences(ids, preferences); err != nil {
			return err
		}
		// Channel preferences cannot discard the required durable in-app rows.
	}
	if len(ids) == 0 {
		return nil
	}
	return repos.Writer.InsertInbox(ctx, event, ids)
}

func normalizeMentionRecipients(event *Event) error {
	if event.Kind != DMMentioned {
		return nil
	}
	distinct := make(map[string]bool, len(event.Facts.NewMentionMemberIDs))
	for _, id := range event.Facts.NewMentionMemberIDs {
		if !canonicalNotificationID(id) {
			return errors.New("invalid resolved mention identity")
		}
		distinct[id] = true
	}
	event.Facts.NewMentionMemberIDs = make([]string, 0, len(distinct))
	for id := range distinct {
		event.Facts.NewMentionMemberIDs = append(event.Facts.NewMentionMemberIDs, id)
	}
	sort.Strings(event.Facts.NewMentionMemberIDs)
	return nil
}

func addressedNotificationRecipients(recipients []string, excludeActor bool, actorID string) ([]string, error) {
	unique := make(map[string]struct{}, len(recipients))
	for _, id := range recipients {
		if !canonicalNotificationID(id) {
			return nil, errors.New("invalid notification recipient identity")
		}
		if excludeActor && id == actorID {
			continue
		}
		unique[id] = struct{}{}
	}
	ids := make([]string, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids, nil
}

func validateAddressedPreferences(ids []string, preferences []Preferences) error {
	requested := make(map[string]bool, len(ids))
	for _, id := range ids {
		requested[id] = true
	}
	seen := make(map[string]bool, len(preferences))
	for _, preference := range preferences {
		if !requested[preference.MemberID] || seen[preference.MemberID] {
			return errors.New("notification preferences do not match addressed recipients")
		}
		seen[preference.MemberID] = true
	}
	if len(seen) != len(ids) {
		return errors.New("notification preferences missing addressed recipient")
	}
	return nil
}

func eventRecipients(ctx context.Context, readers RecipientComposition, event Event) ([]string, bool, error) {
	switch event.Kind {
	case CharacterVerificationDecided:
		if readers.Character == nil {
			return nil, false, errors.New("character recipient reader unavailable")
		}
		id, err := readers.Character.CharacterOwner(ctx, event.SubjectID)
		return []string{id}, false, err
	case QuestSignupConfirmed, QuestWaitlistPromoted:
		if readers.Character == nil {
			return nil, false, errors.New("character recipient reader unavailable")
		}
		id, err := readers.Character.CharacterOwner(ctx, *event.Facts.CharacterID)
		return []string{id}, false, err
	case DocumentEdited, DocumentPublished:
		if readers.Document == nil {
			return nil, false, errors.New("document recipient reader unavailable")
		}
		id, err := readers.Document.DocumentAuthor(ctx, event.SubjectID)
		return []string{id}, true, err
	case DMMentioned:
		return append([]string(nil), event.Facts.NewMentionMemberIDs...), true, nil
	case QuestScheduled:
		return append([]string(nil), event.Facts.RecipientMemberIDs...), true, nil
	default:
		return nil, false, errors.New("unknown notification event kind")
	}
}

func canonicalNotificationID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed != uuid.Nil && parsed.String() == id
}

func validateEvent(event Event) error {
	if !validEventIdentity(event) {
		return errors.New("invalid notification event identity or time")
	}
	f := event.Facts
	if f.Version != 1 || f.EventKind != event.Kind {
		return errors.New("notification fact version or kind mismatch")
	}
	validID := func(id *string) bool { return id != nil && canonicalNotificationID(*id) }
	expectedSubject, allowed, err := validateEventKind(event, validID)
	if err != nil {
		return err
	}
	if event.SubjectType != expectedSubject {
		return errors.New("notification subject kind mismatch")
	}
	for name, present := range map[string]bool{"recipients": f.RecipientMemberIDs != nil, "requestDecision": f.Decision != nil, "changedFields": len(f.ChangedFields) > 0, "verification": f.VerificationID != nil, "verdict": f.Verdict != nil, "questChange": f.QuestChangeID != nil, "oldSchedule": f.OldScheduledAt != nil, "newSchedule": f.NewScheduledAt != nil, "revision": f.RevisionID != nil, "character": f.CharacterID != nil, "from": f.FromStatus != nil, "to": f.ToStatus != nil, "decision": f.DecisionID != nil, "mentions": len(f.NewMentionMemberIDs) > 0, "request": f.RequestID != nil} {
		if present && !allowed[name] {
			return fmt.Errorf("unexpected %s fact for notification kind", name)
		}
	}
	for _, at := range []*time.Time{f.OldScheduledAt, f.NewScheduledAt} {
		if at != nil && at.IsZero() {
			return errors.New("invalid notification schedule time")
		}
	}
	return nil
}

func validEventIdentity(event Event) bool {
	return strings.TrimSpace(event.Key) != "" && canonicalNotificationID(event.SubjectID) && canonicalNotificationID(event.ActorID) && !event.OccurredAt.IsZero()
}

func validateEventKind(event Event, validID func(*string) bool) (string, map[string]bool, error) {
	f := event.Facts
	var allowed map[string]bool
	expectedSubject := ""
	switch event.Kind {
	case CharacterVerificationDecided:
		expectedSubject = "character"
		allowed = allowedNotificationFacts("verification", "verdict", "character")
		if err := validateVerificationFacts(event, validID); err != nil {
			return "", nil, err
		}
	case QuestSignupConfirmed:
		expectedSubject = "quest"
		allowed = allowedNotificationFacts("character", "from", "to")
		if err := validateSignupFacts(f, validID); err != nil {
			return "", nil, err
		}
	case QuestWaitlistPromoted:
		expectedSubject = "quest"
		allowed = allowedNotificationFacts("character", "from", "to")
		if err := validatePromotionFacts(f, validID); err != nil {
			return "", nil, err
		}
	case DocumentEdited, DocumentPublished:
		expectedSubject = "document"
		allowed = allowedNotificationFacts("revision")
		if !validID(f.RevisionID) {
			return "", nil, errors.New("invalid document notification facts")
		}
	case DMMentioned:
		expectedSubject = "document"
		allowed = allowedNotificationFacts("revision", "mentions")
		if !validID(f.RevisionID) || len(f.NewMentionMemberIDs) == 0 {
			return "", nil, errors.New("invalid mention notification facts")
		}
	case QuestScheduled:
		expectedSubject = "quest"
		allowed = allowedNotificationFacts("oldSchedule", "changedFields", "newSchedule", "recipients")
		if err := validateScheduledFacts(f); err != nil {
			return "", nil, err
		}
	default:
		return "", nil, errors.New("unknown notification event kind")
	}
	return expectedSubject, allowed, nil
}

func allowedNotificationFacts(names ...string) map[string]bool {
	allowed := make(map[string]bool, len(names))
	for _, name := range names {
		allowed[name] = true
	}
	return allowed
}

func validateVerificationFacts(event Event, validID func(*string) bool) error {
	f := event.Facts
	if !validID(f.VerificationID) || f.Verdict == nil || (*f.Verdict != "approved" && *f.Verdict != "rejected") || !validID(f.CharacterID) || *f.CharacterID != event.SubjectID {
		return errors.New("invalid verification notification facts")
	}
	return nil
}

func validateSignupFacts(f Facts, validID func(*string) bool) error {
	if !validID(f.CharacterID) || f.ToStatus == nil || (*f.ToStatus != "signed_up" && *f.ToStatus != "waitlisted") {
		return errors.New("invalid signup notification facts")
	}
	if f.FromStatus == nil || *f.FromStatus == "withdrawn" || (*f.FromStatus == "waitlisted" && *f.ToStatus == "signed_up") {
		return nil
	}
	return errors.New("invalid signup notification facts")
}

func validatePromotionFacts(f Facts, validID func(*string) bool) error {
	if !validID(f.CharacterID) || f.FromStatus == nil || f.ToStatus == nil {
		return errors.New("invalid promotion notification facts")
	}
	promoted := *f.FromStatus == "waitlisted" && *f.ToStatus == "signed_up"
	bumped := *f.FromStatus == "signed_up" && *f.ToStatus == "waitlisted"
	if !promoted && !bumped {
		return errors.New("invalid promotion notification facts")
	}
	return nil
}

func validateScheduledFacts(f Facts) error {
	if len(f.ChangedFields) == 0 || f.RecipientMemberIDs == nil {
		return errors.New("invalid scheduled notification facts")
	}
	for _, id := range f.RecipientMemberIDs {
		if !canonicalNotificationID(id) {
			return errors.New("invalid scheduled recipient snapshot")
		}
	}
	return nil
}
