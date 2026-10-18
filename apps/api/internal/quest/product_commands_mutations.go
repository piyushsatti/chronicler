package quest

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (s ProductCommands) requireQueries() error {
	if s.Queries == nil {
		return apierr.New(apierr.Internal, "quest queries unavailable")
	}
	return nil
}

func (s ProductCommands) previewQuest(ctx context.Context, actor auth.Authority, questID string) (*QuestView, error) {
	if err := s.requireQueries(); err != nil {
		return nil, err
	}
	preview, err := s.Queries.Quest(ctx, actor, QuestSpec{Id: &questID})
	if err != nil {
		return nil, err
	}
	if preview == nil {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if preview.DmId == "" {
		return nil, apierr.New(apierr.Invalid, "quest dm missing")
	}
	return preview, nil
}

func (s ProductCommands) questDMRequest(ctx context.Context, actor auth.Authority, operation auth.Operation, questID string) (auth.Request, *QuestView, error) {
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return auth.Request{}, nil, err
	}
	request, err := auth.ForQuest(operation, auth.QuestFacts{ID: questID, DMID: preview.DmId})
	if err != nil {
		return auth.Request{}, nil, err
	}
	return request, preview, nil
}

func (s ProductCommands) CreateQuest(ctx context.Context, actor auth.Authority, spec CreateQuestSpec, meta product.CommandMeta) (QuestView, error) {
	input := spec.Input
	title := strings.TrimSpace(input.Title)
	if title == "" || utf8.RuneCountInString(title) > 200 {
		return QuestView{}, apierr.New(apierr.Invalid, "invalid quest title")
	}
	if strings.TrimSpace(input.BriefBody) == "" {
		return QuestView{}, apierr.New(apierr.Invalid, "quest brief required")
	}
	if input.SlotsMax <= 0 || input.DurationHours <= 0 || input.ScheduledAt.IsZero() {
		return QuestView{}, apierr.New(apierr.Invalid, "invalid quest schedule")
	}
	if len(input.Kinds) == 0 {
		input.Kinds = []string{"standard"}
	}
	dmID := actor.Claims().MemberID
	if input.DmId != nil && strings.TrimSpace(*input.DmId) != "" {
		id := strings.TrimSpace(*input.DmId)
		if err := commandPublicID(&id); err != nil {
			return QuestView{}, err
		}
		dmID = id
		input.DmId = &dmID
	}
	spec.Input = input
	request, err := auth.ForQuestCreate(auth.QuestCreateFacts{RequestedDMID: dmID})
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "createQuest", request, spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		if commandDependencyMissing(repos.Brief) {
			return QuestView{}, apierr.New(apierr.Internal, "quest brief writer required")
		}
		questID := s.IDs()
		if err := commandPublicID(&questID); err != nil {
			return QuestView{}, err
		}
		locked, err := repos.Quest.LockCreateQuest(ctx, CreateQuestSpec{Input: input, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		locked.SubjectID = questID
		brief, err := repos.Brief.CreateBrief(ctx, fresh, document.BriefCreate{
			QuestID:        questID,
			Title:          title,
			Body:           input.BriefBody,
			AdditionalInfo: input.AdditionalInfo,
			DMID:           dmID,
			RegionIDs:      input.RegionIds,
			At:             at,
		})
		if err != nil {
			return QuestView{}, err
		}
		docID := brief.Document.Id
		return repos.Quest.StoreCreateQuest(ctx, CreateQuestWrite{
			ActorID:        fresh.Claims().MemberID,
			At:             at,
			Input:          spec,
			ValidatedInput: CreateQuestSpec{Input: input, AsOf: at},
			Locked:         locked,
			RevisionID:     &docID,
		})
	})
}

func (s ProductCommands) UpdateQuest(ctx context.Context, actor auth.Authority, spec UpdateQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	request, preview, err := s.questDMRequest(ctx, actor, "Mutation.updateQuest", questID)
	if err != nil {
		return QuestView{}, err
	}
	_ = preview
	return runQuestCommand(ctx, s, actor, "updateQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockUpdateQuest(ctx, UpdateQuestSpec{Id: questID, Input: spec.Input, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		if repos.Brief != nil && locked.Before != nil && locked.Before.DocumentId != nil &&
			(spec.Input.Title.Set || spec.Input.BriefBody.Set || spec.Input.AdditionalInfo.Set) {
			edit := document.BriefEdit{DocumentID: *locked.Before.DocumentId, At: at}
			if spec.Input.Title.Set {
				edit.Title = spec.Input.Title
			}
			if spec.Input.BriefBody.Set {
				edit.Body = spec.Input.BriefBody
			}
			if spec.Input.AdditionalInfo.Set {
				edit.AdditionalInfo = spec.Input.AdditionalInfo
			}
			if _, err := repos.Brief.EditBrief(ctx, fresh, edit); err != nil {
				return QuestView{}, err
			}
		}
		return repos.Quest.StoreUpdateQuest(ctx, UpdateQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: UpdateQuestSpec{Id: questID, Input: spec.Input, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) TransitionQuestStatus(ctx context.Context, actor auth.Authority, spec TransitionQuestStatusSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	to := strings.TrimSpace(spec.To)
	if to == "" {
		return QuestView{}, apierr.New(apierr.Invalid, "invalid quest status")
	}
	spec.To = to
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.transitionQuestStatus", questID)
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "transitionQuestStatus", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockTransitionQuestStatus(ctx, TransitionQuestStatusSpec{Id: questID, To: to, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreTransitionQuestStatus(ctx, TransitionQuestStatusWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: TransitionQuestStatusSpec{Id: questID, To: to, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) CloseQuest(ctx context.Context, actor auth.Authority, spec CloseQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.Id)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.Id = questID
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.closeQuest", questID)
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "closeQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockCloseQuest(ctx, CloseQuestSpec{Id: questID, Input: spec.Input, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreCloseQuest(ctx, CloseQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: CloseQuestSpec{Id: questID, Input: spec.Input, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) DeleteQuest(ctx context.Context, actor auth.Authority, spec DeleteQuestSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return product.CommandReceipt{}, err
	}
	spec.QuestId = questID
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.deleteQuest", questID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return runQuestCommand(ctx, s, actor, "deleteQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
		locked, err := repos.Quest.LockDeleteQuest(ctx, DeleteQuestSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return product.CommandReceipt{}, err
		}
		if !locked.Exists {
			return product.CommandReceipt{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreDeleteQuest(ctx, DeleteQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: DeleteQuestSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) RestoreQuest(ctx context.Context, actor auth.Authority, spec RestoreQuestSpec, meta product.CommandMeta) (QuestView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return QuestView{}, err
	}
	spec.QuestId = questID
	// Soft-deleted quests are invisible to ordinary reads; admit via DM id from actor for restore path.
	request, err := auth.ForQuest("Mutation.restoreQuest", auth.QuestFacts{ID: questID, DMID: actor.Claims().MemberID})
	if err != nil {
		return QuestView{}, err
	}
	return runQuestCommand(ctx, s, actor, "restoreQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestView, error) {
		locked, err := repos.Quest.LockRestoreQuest(ctx, RestoreQuestSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return QuestView{}, err
		}
		if !locked.Exists {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreRestoreQuest(ctx, RestoreQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: RestoreQuestSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) SignupForQuest(ctx context.Context, actor auth.Authority, spec SignupForQuestSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	characterID := strings.TrimSpace(spec.CharacterId)
	if err := commandPublicID(&questID); err != nil {
		return QuestParticipantView{}, err
	}
	if err := commandPublicID(&characterID); err != nil {
		return QuestParticipantView{}, err
	}
	spec.QuestId, spec.CharacterId = questID, characterID
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	request, err := auth.ForQuest("Mutation.signupForQuest", auth.QuestFacts{ID: questID, DMID: preview.DmId})
	if err != nil {
		return QuestParticipantView{}, err
	}
	return runQuestCommand(ctx, s, actor, "signupForQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestParticipantView, error) {
		if repos.Characters != nil {
			if _, err := repos.Characters.LockAdmission(ctx, characterID); err != nil {
				return QuestParticipantView{}, err
			}
		}
		locked, err := repos.Quest.LockSignupForQuest(ctx, SignupForQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at})
		if err != nil {
			return QuestParticipantView{}, err
		}
		if !locked.Exists {
			return QuestParticipantView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreSignupForQuest(ctx, SignupForQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: SignupForQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) WithdrawFromQuest(ctx context.Context, actor auth.Authority, spec WithdrawFromQuestSpec, meta product.CommandMeta) (QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	characterID := strings.TrimSpace(spec.CharacterId)
	if err := commandPublicID(&questID); err != nil {
		return QuestParticipantView{}, err
	}
	if err := commandPublicID(&characterID); err != nil {
		return QuestParticipantView{}, err
	}
	spec.QuestId, spec.CharacterId = questID, characterID
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	request, err := auth.ForQuest("Mutation.withdrawFromQuest", auth.QuestFacts{ID: questID, DMID: preview.DmId})
	if err != nil {
		return QuestParticipantView{}, err
	}
	return runQuestCommand(ctx, s, actor, "withdrawFromQuest", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestParticipantView, error) {
		if repos.Characters != nil {
			if _, err := repos.Characters.LockAdmission(ctx, characterID); err != nil {
				return QuestParticipantView{}, err
			}
		}
		locked, err := repos.Quest.LockWithdrawFromQuest(ctx, WithdrawFromQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at})
		if err != nil {
			return QuestParticipantView{}, err
		}
		if !locked.Exists {
			return QuestParticipantView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreWithdrawFromQuest(ctx, WithdrawFromQuestWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: WithdrawFromQuestSpec{QuestId: questID, CharacterId: characterID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) SelectQuestParticipants(ctx context.Context, actor auth.Authority, spec SelectQuestParticipantsSpec, meta product.CommandMeta) ([]QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(spec.CharacterIds))
	for _, id := range spec.CharacterIds {
		trimmed := strings.TrimSpace(id)
		if err := commandPublicID(&trimmed); err != nil {
			return nil, err
		}
		ids = append(ids, trimmed)
	}
	spec.QuestId, spec.CharacterIds = questID, ids
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.selectQuestParticipants", questID)
	if err != nil {
		return nil, err
	}
	return runQuestCommand(ctx, s, actor, "selectQuestParticipants", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestParticipantView, error) {
		if repos.Characters != nil && len(ids) > 0 {
			if _, err := repos.Characters.LockAdmissions(ctx, ids); err != nil {
				return nil, err
			}
		}
		locked, err := repos.Quest.LockSelectQuestParticipants(ctx, SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: ids, AsOf: at})
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreSelectQuestParticipants(ctx, SelectQuestParticipantsWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: SelectQuestParticipantsSpec{QuestId: questID, CharacterIds: ids, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) AttestQuestParticipation(ctx context.Context, actor auth.Authority, spec AttestQuestParticipationSpec, meta product.CommandMeta) ([]QuestParticipantView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	entries := make([]ParticipationAttestationFields, 0, len(spec.Entries))
	for _, entry := range spec.Entries {
		characterID := strings.TrimSpace(entry.CharacterId)
		if err := commandPublicID(&characterID); err != nil {
			return nil, err
		}
		entries = append(entries, ParticipationAttestationFields{CharacterId: characterID, Status: strings.TrimSpace(entry.Status)})
	}
	spec.QuestId, spec.Entries = questID, entries
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.attestQuestParticipation", questID)
	if err != nil {
		return nil, err
	}
	return runQuestCommand(ctx, s, actor, "attestQuestParticipation", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestParticipantView, error) {
		locked, err := repos.Quest.LockAttestQuestParticipation(ctx, AttestQuestParticipationSpec{QuestId: questID, Entries: entries, AsOf: at})
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreAttestQuestParticipation(ctx, AttestQuestParticipationWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: AttestQuestParticipationSpec{QuestId: questID, Entries: entries, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) SetQuestHexes(ctx context.Context, actor auth.Authority, spec SetQuestHexesSpec, meta product.CommandMeta) ([]QuestHexView, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return nil, err
	}
	hexes := make([]QuestHexFields, 0, len(spec.Hexes))
	hexFacts := make([]auth.QuestHexFacts, 0, len(spec.Hexes))
	for _, link := range spec.Hexes {
		nodeID := strings.TrimSpace(link.HexId)
		if err := commandPublicID(&nodeID); err != nil {
			return nil, err
		}
		role := strings.TrimSpace(link.Role)
		hexes = append(hexes, QuestHexFields{HexId: nodeID, Role: role})
		hexFacts = append(hexFacts, auth.QuestHexFacts{ID: nodeID, Role: role})
	}
	spec.QuestId, spec.Hexes = questID, hexes
	preview, err := s.previewQuest(ctx, actor, questID)
	if err != nil {
		return nil, err
	}
	request, err := auth.ForQuest("Mutation.setQuestHexes", auth.QuestFacts{ID: questID, DMID: preview.DmId, Hexes: hexFacts})
	if err != nil {
		return nil, err
	}
	return runQuestCommand(ctx, s, actor, "setQuestHexes", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) ([]QuestHexView, error) {
		locked, err := repos.Quest.LockSetQuestHexes(ctx, SetQuestHexesSpec{QuestId: questID, Hexes: hexes, AsOf: at})
		if err != nil {
			return nil, err
		}
		if !locked.Exists {
			return nil, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreSetQuestHexes(ctx, SetQuestHexesWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: SetQuestHexesSpec{QuestId: questID, Hexes: hexes, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) SetQuestPointcrawlLinks(ctx context.Context, actor auth.Authority, spec SetQuestHexesSpec, meta product.CommandMeta) ([]QuestHexView, error) {
	return s.SetQuestHexes(ctx, actor, spec, meta)
}

func (s ProductCommands) SyncQuestDiscord(ctx context.Context, actor auth.Authority, spec SyncQuestDiscordSpec, meta product.CommandMeta) (DeliveryReceipt, error) {
	questID := strings.TrimSpace(spec.QuestId)
	if err := commandPublicID(&questID); err != nil {
		return DeliveryReceipt{}, err
	}
	spec.QuestId = questID
	request, _, err := s.questDMRequest(ctx, actor, "Mutation.syncQuestDiscord", questID)
	if err != nil {
		return DeliveryReceipt{}, err
	}
	return runQuestCommand(ctx, s, actor, "syncQuestDiscord", request, spec, meta, questID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DeliveryReceipt, error) {
		locked, err := repos.Quest.LockSyncQuestDiscord(ctx, SyncQuestDiscordSpec{QuestId: questID, AsOf: at})
		if err != nil {
			return DeliveryReceipt{}, err
		}
		if !locked.Exists {
			return DeliveryReceipt{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return repos.Quest.StoreSyncQuestDiscord(ctx, SyncQuestDiscordWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: SyncQuestDiscordSpec{QuestId: questID, AsOf: at}, Locked: locked,
		})
	})
}

func (s ProductCommands) UpsertQuestSummary(ctx context.Context, actor auth.Authority, spec UpsertQuestSummarySpec, meta product.CommandMeta) (document.DocumentView, error) {
	if len(spec.Input.QuestIds) == 0 {
		return document.DocumentView{}, apierr.New(apierr.Invalid, "quest ids required")
	}
	questIDs := make([]string, 0, len(spec.Input.QuestIds))
	for _, id := range spec.Input.QuestIds {
		trimmed := strings.TrimSpace(id)
		if err := commandPublicID(&trimmed); err != nil {
			return document.DocumentView{}, err
		}
		questIDs = append(questIDs, trimmed)
	}
	spec.Input.QuestIds = questIDs
	if spec.Input.DocumentId != nil {
		docID := strings.TrimSpace(*spec.Input.DocumentId)
		if err := commandPublicID(&docID); err != nil {
			return document.DocumentView{}, err
		}
		spec.Input.DocumentId = &docID
	}
	facts := auth.SummaryFacts{QuestIDs: questIDs}
	if spec.Input.DocumentId != nil {
		facts.DocumentID = spec.Input.DocumentId
		author := actor.Claims().MemberID
		facts.AuthorID = &author
	}
	if spec.Input.CharacterId != nil {
		characterID := strings.TrimSpace(*spec.Input.CharacterId)
		if err := commandPublicID(&characterID); err != nil {
			return document.DocumentView{}, err
		}
		spec.Input.CharacterId = &characterID
		facts.CharacterID = &characterID
	}
	request, err := auth.ForSummary(facts)
	if err != nil {
		return document.DocumentView{}, err
	}
	subject := questIDs[0]
	return runQuestCommand(ctx, s, actor, "upsertQuestSummary", request, spec, meta, subject, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (document.DocumentView, error) {
		if commandDependencyMissing(repos.Summaries) {
			return document.DocumentView{}, apierr.New(apierr.Internal, "summary writer required")
		}
		locked, err := repos.Quest.LockUpsertQuestSummary(ctx, UpsertQuestSummarySpec{Input: spec.Input, AsOf: at})
		if err != nil {
			return document.DocumentView{}, err
		}
		result, err := repos.Summaries.WriteSummary(ctx, fresh, document.SummaryWrite{
			DocumentID:  spec.Input.DocumentId,
			QuestIDs:    questIDs,
			CharacterID: spec.Input.CharacterId,
			Title:       spec.Input.Title,
			Body:        spec.Input.Body,
			Visibility:  spec.Input.Visibility,
			Frontmatter: spec.Input.Frontmatter,
			At:          at,
		})
		if err != nil {
			return document.DocumentView{}, err
		}
		docID := result.Document.Id
		spec.Input.DocumentId = &docID
		if _, err := repos.Quest.StoreUpsertQuestSummary(ctx, UpsertQuestSummaryWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec,
			ValidatedInput: UpsertQuestSummarySpec{Input: spec.Input, AsOf: at}, Locked: locked,
		}); err != nil {
			return document.DocumentView{}, err
		}
		return result.Document, nil
	})
}
