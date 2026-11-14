package notification

import (
	"encoding/json"
	"errors"
)

func (f *Facts) UnmarshalJSON(raw []byte) error {
	type wire Facts
	var decoded wire
	if err := strictNotificationJSON(raw, &decoded); err != nil {
		return err
	}
	allowed := map[string]bool{"version": true, "eventKind": true}
	var names []string
	switch decoded.EventKind {
	case CharacterVerificationDecided:
		names = []string{"verificationId", "verdict", "characterId"}
	case QuestSignupConfirmed, QuestWaitlistPromoted:
		names = []string{"characterId", "fromStatus", "toStatus"}
	case DocumentEdited, DocumentPublished:
		names = []string{"revisionId"}
	case DMMentioned:
		names = []string{"revisionId", "newMentionMemberIds"}
	case QuestScheduled:
		names = []string{"oldScheduledAt", "newScheduledAt", "changedFields", "recipientMemberIds"}
	default:
		return opaqueNotificationProofError(errors.New("unsupported notification event kind"))
	}
	for _, name := range names {
		allowed[name] = true
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	for name := range fields {
		if !allowed[name] {
			return opaqueNotificationProofError(errors.New("unexpected notification facts field"))
		}
	}
	*f = Facts(decoded)
	return nil
}
