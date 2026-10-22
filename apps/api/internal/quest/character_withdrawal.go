package quest

import (
	"context"
	"reflect"
	"slices"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

func (p *ProductPostgres) PlanOwnedCharacterWithdrawal(ctx context.Context, characterID string, questIDs []string) (character.WithdrawalPlan, error) {
	plan := character.WithdrawalPlan{OwnedCharacterID: characterID, CharacterIDs: []string{characterID}, QuestIDs: []string{}, Bindings: []character.LiveParticipationBinding{}}
	ids := make([]pgtype.UUID, 0, len(questIDs))
	for _, id := range questIDs {
		parsed, err := questUUID(id)
		if err != nil {
			return plan, err
		}
		ids = append(ids, parsed)
	}
	target, err := questUUID(characterID)
	if err != nil {
		return plan, err
	}
	rows, err := p.queries().ProductQuestCharacterWithdrawalPlan(ctx, dbgen.ProductQuestCharacterWithdrawalPlanParams{CharacterID: target, QuestIds: ids})
	if err != nil {
		return plan, err
	}
	for _, row := range rows {
		qid, cid := db.UUIDString(row.QuestID), db.UUIDString(row.CharacterID)
		plan.QuestIDs = append(plan.QuestIDs, qid)
		plan.CharacterIDs = append(plan.CharacterIDs, cid)
		plan.Bindings = append(plan.Bindings, character.LiveParticipationBinding{QuestID: qid, CharacterID: cid, MemberID: db.UUIDString(row.MemberID), Status: row.Status, ScheduledAt: row.ScheduledAt.Time, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time})
	}
	slices.Sort(plan.QuestIDs)
	plan.QuestIDs = slices.Compact(plan.QuestIDs)
	slices.Sort(plan.CharacterIDs)
	plan.CharacterIDs = slices.Compact(plan.CharacterIDs)
	return plan, nil
}

func (p *ProductPostgres) WithdrawOwnedCharacter(ctx context.Context, actorID string, plan character.WithdrawalPlan, reason string, at time.Time) (character.WithdrawalEffects, error) {
	effects := character.WithdrawalEffects{Bindings: []character.LiveParticipationBinding{}, PromotedMemberIDs: []string{}, Events: []notification.Event{}}
	lockedQuests := make([]WithdrawFromQuestState, 0, len(plan.QuestIDs))
	for _, id := range plan.QuestIDs {
		locked, err := p.LockWithdrawFromQuest(ctx, WithdrawFromQuestSpec{QuestId: id, CharacterId: plan.OwnedCharacterID, AsOf: at})
		if err != nil {
			return effects, err
		}
		if !locked.Exists {
			return effects, character.ErrWithdrawalPlanChanged
		}
		lockedQuests = append(lockedQuests, locked)
	}
	current, err := p.PlanOwnedCharacterWithdrawal(ctx, plan.OwnedCharacterID, plan.QuestIDs)
	if err != nil {
		return effects, err
	}
	if !reflect.DeepEqual(current, plan) {
		return effects, character.ErrWithdrawalPlanChanged
	}
	ids := make([]pgtype.UUID, 0, len(plan.CharacterIDs))
	for _, id := range plan.CharacterIDs {
		ids = append(ids, mustUUID(id))
	}
	rows, err := p.queries().ProductQuestWithdrawalAdmissions(ctx, ids)
	if err != nil {
		return effects, err
	}
	admissions := make([]character.Admission, 0, len(rows))
	var own *character.Admission
	for _, row := range rows {
		admission := character.Admission{ID: db.UUIDString(row.PublicID), OwnerID: db.UUIDString(row.OwnerID), Status: row.Status, OwnerStatus: row.OwnerStatus, Trusted: row.Status == "active", UpdatedAt: row.UpdatedAt.Time}
		admissions = append(admissions, admission)
		if admission.ID == plan.OwnedCharacterID {
			own = &admissions[len(admissions)-1]
		}
	}
	if own == nil || own.OwnerID != actorID {
		return effects, apierr.New(apierr.Forbidden, "character owner required")
	}
	for i, locked := range lockedQuests {
		questID := plan.QuestIDs[i]
		previous := questParticipant(locked.Roster, plan.OwnedCharacterID)
		if previous == nil {
			return effects, character.ErrWithdrawalPlanChanged
		}
		locked.Character = own
		result, err := p.StoreWithdrawFromQuest(ctx, WithdrawFromQuestWrite{ActorID: actorID, At: at, ValidatedInput: WithdrawFromQuestSpec{QuestId: questID, CharacterId: plan.OwnedCharacterID, AsOf: at}, Locked: locked})
		if err != nil {
			return effects, err
		}
		effects.Bindings = append(effects.Bindings, character.LiveParticipationBinding{QuestID: questID, CharacterID: result.CharacterId, MemberID: result.MemberId, Status: result.Status, ScheduledAt: locked.Before.ScheduledAt, CreatedAt: result.CreatedAt, UpdatedAt: result.UpdatedAt})
		if previous.Status != "signed_up" {
			continue
		}
		for _, candidate := range locked.Roster {
			if candidate.Status != "waitlisted" || candidate.CharacterId == plan.OwnedCharacterID {
				continue
			}
			eligible := false
			for _, admission := range admissions {
				if admission.ID == candidate.CharacterId {
					eligible = eligibleQuestCharacter(admission)
					break
				}
			}
			if !eligible {
				continue
			}
			selected, err := p.StoreSelectQuestParticipants(ctx, SelectQuestParticipantsWrite{ActorID: actorID, At: at, ValidatedInput: SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: []string{candidate.CharacterId}, AsOf: at}, Locked: SelectQuestParticipantsState{Exists: true, Before: locked.Before, Roster: locked.Roster, Candidates: admissions}})
			if err != nil {
				return effects, err
			}
			if len(selected) != 1 {
				return effects, apierr.New(apierr.Internal, "promotion result missing")
			}
			from, to := "waitlisted", "signed_up"
			effects.PromotedMemberIDs = append(effects.PromotedMemberIDs, candidate.MemberId)
			effects.Events = append(effects.Events, notification.Event{Key: "quest-promotion:" + questID + ":" + candidate.CharacterId + ":" + plan.OwnedCharacterID + ":" + strconv.FormatInt(previous.UpdatedAt.UnixNano(), 10), Kind: notification.QuestWaitlistPromoted, SubjectType: "quest", SubjectID: questID, ActorID: actorID, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.QuestWaitlistPromoted, CharacterID: &candidate.CharacterId, FromStatus: &from, ToStatus: &to}})
			break
		}
	}
	return effects, nil
}

var _ character.QuestWithdrawalWriter = (*ProductPostgres)(nil)
