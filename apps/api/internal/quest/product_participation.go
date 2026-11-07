package quest

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func ownedQuestCharacterRequest(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, characterID string) (auth.Request, error) {
	if product.MissingDependency(repos.Characters) {
		return auth.Request{}, apierr.New(apierr.Internal, "character admission reader required")
	}
	owner, err := repos.Characters.ReadImmutableOwner(ctx, characterID)
	if err != nil {
		return auth.Request{}, err
	}
	return auth.ForCharacter(operation, auth.CharacterFacts{ID: characterID, OwnerID: owner})
}

func eligibleQuestCharacter(admission character.Admission) bool {
	return admission.Trusted && admission.Status == "active" && admission.OwnerStatus == "active"
}

func admitLockedQuestCharacter(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, characterID, ownerID string) error {
	current, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return err
	}
	if current.Claims().MemberID != actor.Claims().MemberID || current.Claims().MemberID != ownerID {
		return apierr.New(apierr.Forbidden, "character owner required")
	}
	request, err := auth.ForCharacter(operation, auth.CharacterFacts{ID: characterID, OwnerID: ownerID})
	if err != nil {
		return err
	}
	decision, err := repos.Policy.Decide(ctx, current, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "quest command forbidden")
	}
	if !sameQuestAuthority(actor, current) {
		return apierr.New(apierr.Conflict, "quest admission changed; retry with current authority")
	}
	return nil
}

// selectionExceedsSeatCap reports whether seating `adding` more characters would pass the
// quest's open seats. DM Pick has no seat cap; every other signup type, including an unset one, does.
func selectionExceedsSeatCap(signupType *string, slotsMax, filledCount, adding int32) bool {
	if signupType != nil && *signupType == dmPickSignup {
		return false
	}
	return adding > slotsMax-filledCount
}

func validateQuestSelection(locked SelectQuestParticipantsState, ids []string) error {
	if locked.Before == nil || locked.Before.Status != "open" && locked.Before.Status != "full" {
		return apierr.New(apierr.Conflict, "quest is not accepting participant selection")
	}
	admissions := make(map[string]character.Admission, len(locked.Candidates))
	for _, admission := range locked.Candidates {
		admissions[admission.ID] = admission
	}
	for _, id := range ids {
		admission, ok := admissions[id]
		if !ok {
			return apierr.New(apierr.NotFound, "selected character not found")
		}
		if !eligibleQuestCharacter(admission) {
			return apierr.New(apierr.Conflict, "selected character must be active and approved")
		}
		participant := questParticipant(locked.Roster, id)
		if participant == nil || participant.Status != "waitlisted" {
			return apierr.New(apierr.Conflict, "selection requires a waitlisted participant")
		}
	}
	return nil
}

func questParticipant(roster []QuestParticipantView, characterID string) *QuestParticipantView {
	for _, entry := range roster {
		if entry.CharacterId == characterID {
			return &entry
		}
	}
	return nil
}

func recordQuestParticipation(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, kind notification.EventKind, key, questID, characterID string, from *string, to string, at time.Time) error {
	if product.MissingDependency(repos.Producer) {
		return apierr.New(apierr.Internal, "quest notification producer required")
	}
	return repos.Producer.Record(ctx, repos.Notice, notification.Event{Key: key, Kind: kind, SubjectType: "quest", SubjectID: questID, ActorID: actor.Claims().MemberID, OccurredAt: at,
		Facts: notification.Facts{Version: 1, EventKind: kind, CharacterID: &characterID, FromStatus: from, ToStatus: &to}})
}
