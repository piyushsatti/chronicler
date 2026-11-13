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
	lockedQuests, err := p.lockWithdrawalQuests(ctx, plan, at)
	if err != nil {
		return effects, err
	}
	if err := p.recheckWithdrawalPlan(ctx, plan); err != nil {
		return effects, err
	}
	admissions, own, err := p.withdrawalAdmissions(ctx, plan, actorID)
	if err != nil {
		return effects, err
	}
	for i, locked := range lockedQuests {
		questID := plan.QuestIDs[i]
		locked.Character = own
		if err := p.withdrawQuestParticipant(ctx, &effects, actorID, plan, admissions, own, at, questID, locked); err != nil {
			return effects, err
		}
	}
	return effects, nil
}

func (p *ProductPostgres) lockWithdrawalQuests(ctx context.Context, plan character.WithdrawalPlan, at time.Time) ([]WithdrawFromQuestState, error) {
	lockedQuests := make([]WithdrawFromQuestState, 0, len(plan.QuestIDs))
	for _, id := range plan.QuestIDs {
		locked, err := p.LockWithdrawFromQuest(ctx, WithdrawFromQuestSpec{QuestId: id, CharacterId: plan.OwnedCharacterID, AsOf: at})
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, character.ErrWithdrawalPlanChanged
		}
		lockedQuests = append(lockedQuests, locked)
	}
	return lockedQuests, nil
}

func (p *ProductPostgres) recheckWithdrawalPlan(ctx context.Context, plan character.WithdrawalPlan) error {
	current, err := p.PlanOwnedCharacterWithdrawal(ctx, plan.OwnedCharacterID, plan.QuestIDs)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(current, plan) {
		return character.ErrWithdrawalPlanChanged
	}
	return nil
}

func (p *ProductPostgres) withdrawalAdmissions(ctx context.Context, plan character.WithdrawalPlan, actorID string) ([]character.Admission, *character.Admission, error) {
	ids := make([]pgtype.UUID, 0, len(plan.CharacterIDs))
	for _, id := range plan.CharacterIDs {
		ids = append(ids, mustUUID(id))
	}
	rows, err := p.queries().ProductQuestWithdrawalAdmissions(ctx, ids)
	if err != nil {
		return nil, nil, err
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
		return nil, nil, apierr.New(apierr.Forbidden, "character owner required")
	}
	return admissions, own, nil
}

func (p *ProductPostgres) withdrawQuestParticipant(ctx context.Context, effects *character.WithdrawalEffects, actorID string, plan character.WithdrawalPlan, admissions []character.Admission, own *character.Admission, at time.Time, questID string, locked WithdrawFromQuestState) error {
	previous := questParticipant(locked.Roster, plan.OwnedCharacterID)
	if previous == nil {
		return character.ErrWithdrawalPlanChanged
	}
	locked.Character = own
	result, err := p.StoreWithdrawFromQuest(ctx, WithdrawFromQuestWrite{ActorID: actorID, At: at, ValidatedInput: WithdrawFromQuestSpec{QuestId: questID, CharacterId: plan.OwnedCharacterID, AsOf: at}, Locked: locked})
	if err != nil {
		return err
	}
	effects.Bindings = append(effects.Bindings, character.LiveParticipationBinding{QuestID: questID, CharacterID: result.CharacterId, MemberID: result.MemberId, Status: result.Status, ScheduledAt: locked.Before.ScheduledAt, CreatedAt: result.CreatedAt, UpdatedAt: result.UpdatedAt})
	if previous.Status == "signed_up" {
		return p.promoteQuestWaitlist(ctx, effects, actorID, plan, admissions, at, questID, locked, previous)
	}
	return nil
}

func (p *ProductPostgres) promoteQuestWaitlist(ctx context.Context, effects *character.WithdrawalEffects, actorID string, plan character.WithdrawalPlan, admissions []character.Admission, at time.Time, questID string, locked WithdrawFromQuestState, previous *QuestParticipantView) error {
	// Pre-withdrawal count: one withdrawal from an over-cap DM Pick party does not open a seat.
	if locked.Before != nil && locked.Before.SignupType != nil && *locked.Before.SignupType == dmPickSignup && locked.Before.FilledCount > locked.Before.SlotsMax {
		return nil
	}
	candidates := locked.Roster
	if locked.Before != nil && locked.Before.SignupType != nil && *locked.Before.SignupType == lastGamePlayedSignup {
		ordered, err := p.waitlistBySeatPriority(ctx, questID, locked.Roster)
		if err != nil {
			return err
		}
		candidates = ordered
	}
	for _, candidate := range candidates {
		if candidate.Status != "waitlisted" || candidate.CharacterId == plan.OwnedCharacterID || !eligibleWithdrawalCandidate(admissions, candidate.CharacterId) {
			continue
		}
		selected, err := p.StoreSelectQuestParticipants(ctx, SelectQuestParticipantsWrite{ActorID: actorID, At: at, ValidatedInput: SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: []string{candidate.CharacterId}, AsOf: at}, Locked: SelectQuestParticipantsState{Exists: true, Before: locked.Before, Roster: locked.Roster, Candidates: admissions}})
		if err != nil {
			return err
		}
		if len(selected) != 1 {
			return apierr.New(apierr.Internal, "promotion result missing")
		}
		from, to := "waitlisted", "signed_up"
		effects.PromotedMemberIDs = append(effects.PromotedMemberIDs, candidate.MemberId)
		effects.Events = append(effects.Events, notification.Event{Key: "quest-promotion:" + questID + ":" + candidate.CharacterId + ":" + plan.OwnedCharacterID + ":" + strconv.FormatInt(previous.UpdatedAt.UnixNano(), 10), Kind: notification.QuestWaitlistPromoted, SubjectType: "quest", SubjectID: questID, ActorID: actorID, OccurredAt: at, Facts: notification.Facts{Version: 1, EventKind: notification.QuestWaitlistPromoted, CharacterID: &candidate.CharacterId, FromStatus: &from, ToStatus: &to}})
		break
	}
	return nil
}

func eligibleWithdrawalCandidate(admissions []character.Admission, characterID string) bool {
	for _, admission := range admissions {
		if admission.ID == characterID {
			return eligibleQuestCharacter(admission)
		}
	}
	return false
}

var _ character.QuestWithdrawalWriter = (*ProductPostgres)(nil)
