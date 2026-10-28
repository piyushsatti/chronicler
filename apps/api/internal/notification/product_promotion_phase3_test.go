package notification

import "testing"

// validatePromotionFacts backs the QuestWaitlistPromoted notification kind, which now covers
// both directions of a Last Game Played seat swap: the newcomer promoted onto the seat
// (waitlisted -> signed_up) and the veteran bumped off it (signed_up -> waitlisted).
func TestValidatePromotionFactsAcceptsBothDirections(t *testing.T) {
	validID := func(id *string) bool { return id != nil && canonicalNotificationID(*id) }
	for name, tc := range map[string]struct {
		characterID *string
		from, to    *string
		wantErr     bool
	}{
		"promoted waitlisted to signed_up": {producerPointer(producerCharacter), producerPointer("waitlisted"), producerPointer("signed_up"), false},
		"bumped signed_up to waitlisted":   {producerPointer(producerCharacter), producerPointer("signed_up"), producerPointer("waitlisted"), false},
		"unrelated from status rejected":   {producerPointer(producerCharacter), producerPointer("withdrawn"), producerPointer("signed_up"), true},
		"nil character id rejected":        {nil, producerPointer("waitlisted"), producerPointer("signed_up"), true},
		"nil from status rejected":         {producerPointer(producerCharacter), nil, producerPointer("signed_up"), true},
		"nil to status rejected":           {producerPointer(producerCharacter), producerPointer("waitlisted"), nil, true},
	} {
		t.Run(name, func(t *testing.T) {
			err := validatePromotionFacts(Facts{CharacterID: tc.characterID, FromStatus: tc.from, ToStatus: tc.to}, validID)
			if (err != nil) != tc.wantErr {
				t.Fatalf("validatePromotionFacts() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// notificationLabel must distinguish the bumped-down direction from the promoted-up direction
// for QuestWaitlistPromoted, since the same event kind now serves both.
func TestNotificationLabelQuestWaitlistPromotedIsDirectionAware(t *testing.T) {
	for name, tc := range map[string]struct {
		to   string
		want string
	}{
		"promoted to signed_up stays promoted": {"signed_up", "Quest waitlist promoted"},
		"bumped to waitlisted reads as moved":  {"waitlisted", "Moved to the waitlist"},
	} {
		t.Run(name, func(t *testing.T) {
			event := Event{Kind: QuestWaitlistPromoted, Facts: Facts{ToStatus: producerPointer(tc.to)}}
			if got := notificationLabel(event); got != tc.want {
				t.Fatalf("notificationLabel() = %q, want %q", got, tc.want)
			}
		})
	}
}
