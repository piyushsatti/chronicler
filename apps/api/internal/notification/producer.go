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
	if event.Kind == DMMentioned {
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
	}
	recipients, excludeActor, err := eventRecipients(ctx, repos.Recipients, event)
	if err != nil {
		return err
	}
	unique := make(map[string]struct{}, len(recipients))
	for _, id := range recipients {
		if !canonicalNotificationID(id) {
			return errors.New("invalid notification recipient identity")
		}
		if excludeActor && id == event.ActorID {
			continue
		}
		unique[id] = struct{}{}
	}
	ids := make([]string, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) > 0 {
		preferences, err := repos.Preferences.ReadPreferences(ctx, append([]string(nil), ids...))
		if err != nil {
			return err
		}
		seen := make(map[string]bool, len(preferences))
		for _, preference := range preferences {
			if _, requested := unique[preference.MemberID]; !requested || seen[preference.MemberID] {
				return errors.New("notification preferences do not match addressed recipients")
			}
			seen[preference.MemberID] = true
		}
		if len(seen) != len(ids) {
			return errors.New("notification preferences missing addressed recipient")
		}
		// Channel preferences cannot discard the required durable in-app rows.
	}
	if len(ids) == 0 {
		return nil
	}
	return repos.Writer.InsertInbox(ctx, event, ids)
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
	if strings.TrimSpace(event.Key) == "" || !canonicalNotificationID(event.SubjectID) || !canonicalNotificationID(event.ActorID) || event.OccurredAt.IsZero() {
		return errors.New("invalid notification event identity or time")
	}
	f := event.Facts
	if f.Version != 1 || f.EventKind != event.Kind {
		return errors.New("notification fact version or kind mismatch")
	}
	validID := func(id *string) bool { return id != nil && canonicalNotificationID(*id) }
	allowed := make(map[string]bool)
	expectedSubject := ""
	switch event.Kind {
	case CharacterVerificationDecided:
		expectedSubject = "character"
		allowed["verification"] = true
		allowed["verdict"] = true
		allowed["character"] = true
		if !validID(f.VerificationID) || f.Verdict == nil || (*f.Verdict != "approved" && *f.Verdict != "rejected") || !validID(f.CharacterID) || *f.CharacterID != event.SubjectID {
			return errors.New("invalid verification notification facts")
		}
	case QuestSignupConfirmed:
		expectedSubject = "quest"
		allowed["character"] = true
		allowed["from"] = true
		allowed["to"] = true
		if !validID(f.CharacterID) || f.ToStatus == nil || (*f.ToStatus != "signed_up" && *f.ToStatus != "waitlisted") {
			return errors.New("invalid signup notification facts")
		}
		if f.FromStatus != nil {
			switch *f.FromStatus {
			case "withdrawn":
			case "waitlisted":
				if *f.ToStatus != "signed_up" {
					return errors.New("invalid signup notification facts")
				}
			default:
				return errors.New("invalid signup notification facts")
			}
		}
	case QuestWaitlistPromoted:
		expectedSubject = "quest"
		allowed["character"] = true
		allowed["from"] = true
		allowed["to"] = true
		if !validID(f.CharacterID) || f.FromStatus == nil || *f.FromStatus != "waitlisted" || f.ToStatus == nil || *f.ToStatus != "signed_up" {
			return errors.New("invalid promotion notification facts")
		}
	case DocumentEdited, DocumentPublished:
		expectedSubject = "document"
		allowed["revision"] = true
		if !validID(f.RevisionID) {
			return errors.New("invalid document notification facts")
		}
	case DMMentioned:
		expectedSubject = "document"
		allowed["revision"] = true
		allowed["mentions"] = true
		if !validID(f.RevisionID) || len(f.NewMentionMemberIDs) == 0 {
			return errors.New("invalid mention notification facts")
		}
	case QuestScheduled:
		expectedSubject = "quest"
		allowed["oldSchedule"] = true
		allowed["changedFields"] = true
		allowed["newSchedule"] = true
		allowed["recipients"] = true
		if len(f.ChangedFields) == 0 || f.RecipientMemberIDs == nil {
			return errors.New("invalid scheduled notification facts")
		}
		for _, id := range f.RecipientMemberIDs {
			if !canonicalNotificationID(id) {
				return errors.New("invalid scheduled recipient snapshot")
			}
		}
	default:
		return errors.New("unknown notification event kind")
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
