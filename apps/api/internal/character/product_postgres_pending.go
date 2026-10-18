package character

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "character product surface pending")
}

func (p *ProductPostgres) ReadCharacterLogs(context.Context, auth.Authority, CharacterLogsSpec) (CharacterLogListResult, error) {
	return CharacterLogListResult{}, p.pending()
}
func (p *ProductPostgres) ReadCharacterSummaries(context.Context, auth.Authority, CharacterSummariesSpec) (document.DocumentListResult, error) {
	return document.DocumentListResult{}, p.pending()
}
func (p *ProductPostgres) ReadCoPlayers(context.Context, auth.Authority, CoPlayersSpec) (CoPlayerPage, error) {
	return CoPlayerPage{}, p.pending()
}
func (p *ProductPostgres) ReadDowntimeProjects(context.Context, auth.Authority, DowntimeProjectsSpec) (DowntimeProjectListResult, error) {
	return DowntimeProjectListResult{}, p.pending()
}
func (p *ProductPostgres) ReadMyQuestRewards(context.Context, auth.Authority, MyQuestRewardsSpec) (RewardEntitlementPage, error) {
	return RewardEntitlementPage{}, p.pending()
}
func (p *ProductPostgres) ReadParticipationsByCharacter(context.Context, auth.Authority, ParticipationsByCharacterSpec) (ParticipationPageView, error) {
	return ParticipationPageView{}, p.pending()
}
func (p *ProductPostgres) ReadBackstories(context.Context, auth.Authority, BackstoriesSpec) (BackstoryPage, error) {
	return BackstoryPage{}, p.pending()
}
func (p *ProductPostgres) ReadCreationCatalog(context.Context, auth.Authority, CreationCatalogSpec) (CreationCatalogPage, error) {
	return CreationCatalogPage{}, p.pending()
}

func (p *ProductPostgres) LockAdjustPcxp(context.Context, AdjustPcxpSpec) (AdjustPcxpState, error) {
	return AdjustPcxpState{}, p.pending()
}
func (p *ProductPostgres) StoreAdjustPcxp(context.Context, AdjustPcxpWrite) (ProgressionEntryView, error) {
	return ProgressionEntryView{}, p.pending()
}
func (p *ProductPostgres) LockClaimQuestRewards(context.Context, ClaimQuestRewardsSpec) (ClaimQuestRewardsState, error) {
	return ClaimQuestRewardsState{}, p.pending()
}
func (p *ProductPostgres) StoreClaimQuestRewards(context.Context, ClaimQuestRewardsWrite) (RewardClaimReceipt, error) {
	return RewardClaimReceipt{}, p.pending()
}
func (p *ProductPostgres) LockCreateCharacter(context.Context, CreateCharacterSpec) (CreateCharacterState, error) {
	return CreateCharacterState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateCharacter(context.Context, CreateCharacterWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockDecideVerification(context.Context, DecideVerificationSpec) (DecideVerificationState, error) {
	return DecideVerificationState{}, p.pending()
}
func (p *ProductPostgres) StoreDecideVerification(context.Context, DecideVerificationWrite) (member.VerificationView, error) {
	return member.VerificationView{}, p.pending()
}
func (p *ProductPostgres) LockDeleteCharacter(context.Context, DeleteCharacterSpec) (DeleteCharacterState, error) {
	return DeleteCharacterState{}, p.pending()
}
func (p *ProductPostgres) StoreDeleteCharacter(context.Context, DeleteCharacterWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockDeleteCharacterLog(context.Context, DeleteCharacterLogSpec) (DeleteCharacterLogState, error) {
	return DeleteCharacterLogState{}, p.pending()
}
func (p *ProductPostgres) StoreDeleteCharacterLog(context.Context, DeleteCharacterLogWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockLogCharacterEvent(context.Context, LogCharacterEventSpec) (LogCharacterEventState, error) {
	return LogCharacterEventState{}, p.pending()
}
func (p *ProductPostgres) StoreLogCharacterEvent(context.Context, LogCharacterEventWrite) (CharacterLogView, error) {
	return CharacterLogView{}, p.pending()
}
func (p *ProductPostgres) LockRestoreCharacter(context.Context, RestoreCharacterSpec) (RestoreCharacterState, error) {
	return RestoreCharacterState{}, p.pending()
}
func (p *ProductPostgres) StoreRestoreCharacter(context.Context, RestoreCharacterWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockRetireCharacter(context.Context, RetireCharacterSpec) (RetireCharacterState, error) {
	return RetireCharacterState{}, p.pending()
}
func (p *ProductPostgres) StoreRetireCharacter(context.Context, RetireCharacterWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockSetCharacterGuild(context.Context, SetCharacterGuildSpec) (SetCharacterGuildState, error) {
	return SetCharacterGuildState{}, p.pending()
}
func (p *ProductPostgres) StoreSetCharacterGuild(context.Context, SetCharacterGuildWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockSubmitForVerification(context.Context, SubmitForVerificationSpec) (SubmitForVerificationState, error) {
	return SubmitForVerificationState{}, p.pending()
}
func (p *ProductPostgres) StoreSubmitForVerification(context.Context, SubmitForVerificationWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockSyncCharacterDdb(context.Context, SyncCharacterDdbSpec) (SyncCharacterDdbState, error) {
	return SyncCharacterDdbState{}, p.pending()
}
func (p *ProductPostgres) StoreSyncCharacterDdb(context.Context, SyncCharacterDdbWrite) (DdbSyncReceipt, error) {
	return DdbSyncReceipt{}, p.pending()
}
func (p *ProductPostgres) LockUpdateCharacterProfile(context.Context, UpdateCharacterProfileSpec) (UpdateCharacterProfileState, error) {
	return UpdateCharacterProfileState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateCharacterProfile(context.Context, UpdateCharacterProfileWrite) (CharacterView, error) {
	return CharacterView{}, p.pending()
}
func (p *ProductPostgres) LockUpsertDowntimeProject(context.Context, UpsertDowntimeProjectSpec) (UpsertDowntimeProjectState, error) {
	return UpsertDowntimeProjectState{}, p.pending()
}
func (p *ProductPostgres) StoreUpsertDowntimeProject(context.Context, UpsertDowntimeProjectWrite) (DowntimeProjectView, error) {
	return DowntimeProjectView{}, p.pending()
}

func (p *ProductPostgres) LockCreateBackstory(context.Context, CreateBackstorySpec) (CreateBackstoryState, error) {
	return CreateBackstoryState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateBackstory(context.Context, CreateBackstoryWrite) (BackstoryView, error) {
	return BackstoryView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateBackstory(context.Context, UpdateBackstorySpec) (UpdateBackstoryState, error) {
	return UpdateBackstoryState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateBackstory(context.Context, UpdateBackstoryWrite) (BackstoryView, error) {
	return BackstoryView{}, p.pending()
}
func (p *ProductPostgres) LockUpsertCreationCatalogEntry(context.Context, UpsertCreationCatalogEntrySpec) (UpsertCreationCatalogEntryState, error) {
	return UpsertCreationCatalogEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreUpsertCreationCatalogEntry(context.Context, UpsertCreationCatalogEntryWrite) (CreationCatalogEntryView, error) {
	return CreationCatalogEntryView{}, p.pending()
}
