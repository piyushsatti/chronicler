package quest

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

type rosterCorrection struct {
	Status string
	Delta  int32
	Skip   bool
}

// planRosterCorrection seats a character or removes one. Removing a seated
// character frees the seat and does not promote the waitlist; that fill stays
// on the player's own withdrawal.
func planRosterCorrection(action string, quest *QuestView, admission *character.Admission, previous *QuestParticipantView) (rosterCorrection, error) {
	if quest == nil || (quest.Status != "open" && quest.Status != "full") {
		return rosterCorrection{}, apierr.New(apierr.Conflict, "quest is not accepting roster changes")
	}
	switch action {
	case "add":
		return planRosterAdd(quest, admission, previous)
	case "remove":
		return planRosterRemove(previous)
	default:
		return rosterCorrection{}, apierr.New(apierr.Invalid, "invalid roster action")
	}
}

func planRosterAdd(quest *QuestView, admission *character.Admission, previous *QuestParticipantView) (rosterCorrection, error) {
	if admission == nil {
		return rosterCorrection{}, apierr.New(apierr.NotFound, "character not found")
	}
	if admission.OwnerID == quest.DmId {
		return rosterCorrection{}, apierr.New(apierr.Forbidden, "quest dm cannot sign up")
	}
	if !eligibleQuestCharacter(*admission) {
		return rosterCorrection{}, apierr.New(apierr.Conflict, "active approved character required")
	}
	if previous != nil && previous.Status != "withdrawn" && previous.Status != "waitlisted" {
		if previous.Status == "signed_up" {
			return rosterCorrection{}, apierr.New(apierr.Conflict, "already signed up for this quest")
		}
		return rosterCorrection{}, apierr.New(apierr.Conflict, "participation is already final")
	}
	if selectionExceedsSeatCap(quest.SignupType, quest.SlotsMax, quest.FilledCount, 1) {
		return rosterCorrection{}, apierr.New(apierr.Conflict, "quest capacity exceeded")
	}
	return rosterCorrection{Status: "signed_up", Delta: 1}, nil
}

func planRosterRemove(previous *QuestParticipantView) (rosterCorrection, error) {
	if previous == nil {
		return rosterCorrection{}, apierr.New(apierr.NotFound, "participant not found")
	}
	if previous.Status == "withdrawn" {
		return rosterCorrection{Status: "withdrawn", Skip: true}, nil
	}
	if previous.Status != "signed_up" && previous.Status != "waitlisted" {
		return rosterCorrection{}, apierr.New(apierr.Conflict, "participation is already final")
	}
	delta := int32(0)
	if previous.Status == "signed_up" {
		delta = -1
	}
	return rosterCorrection{Status: "withdrawn", Delta: delta}, nil
}

func rosterAdmission(candidates []character.Admission, id string) *character.Admission {
	for i := range candidates {
		if candidates[i].ID == id {
			return &candidates[i]
		}
	}
	return nil
}
