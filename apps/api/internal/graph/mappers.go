package graph

import (
	"encoding/json"
	"time"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func toQuestFiltersFields(filters *QuestFiltersInput) *quest.QuestFiltersFields {
	if filters == nil {
		return nil
	}
	return &quest.QuestFiltersFields{
		Status:        filters.Status,
		Kind:          filters.Kind,
		DmId:          filters.DmID,
		RegionId:      filters.RegionID,
		ArcId:         filters.ArcID,
		Tag:           filters.Tag,
		Genre:         filters.Genre,
		ShortCodes:    filters.ShortCodes,
		Search:        filters.Search,
		DisplayStatus: filters.DisplayStatus,
		ScheduledFrom: filters.ScheduledFrom,
		ScheduledTo:   filters.ScheduledTo,
	}
}

func toQuestsSpec(filters *QuestFiltersInput, limit, offset int) quest.QuestsSpec {
	spec := quest.QuestsSpec{Limit: int32(limit), Offset: int32(offset)}
	spec.Filters = toQuestFiltersFields(filters)
	if filters != nil {
		if filters.Tag != nil && *filters.Tag != "" {
			spec.TagFilterSet = true
			spec.TagVariants = []string{*filters.Tag}
		}
		if filters.Genre != nil && *filters.Genre != "" {
			spec.GenreFilterSet = true
			spec.GenreVariants = []string{*filters.Genre}
		}
	}
	return spec
}

func toQuestView(v quest.QuestView) *QuestType {
	var apl *int
	if v.Apl != nil {
		i := int(*v.Apl)
		apl = &i
	}
	return &QuestType{
		ID:               v.Id,
		ShortCode:        v.ShortCode,
		Kinds:            v.Kinds,
		Status:           v.Status,
		DmID:             v.DmId,
		ArcID:            v.ArcId,
		ScheduledAt:      v.ScheduledAt,
		DurationHours:    v.DurationHours,
		SlotsMax:         int(v.SlotsMax),
		FilledCount:      int(v.FilledCount),
		DocumentID:       v.DocumentId,
		DiscordMessageID: v.DiscordMessageId,
		DiscordEventID:   v.DiscordEventId,
		EventURL:         v.EventUrl,
		AnnounceError:    v.AnnounceError,
		Tags:             v.Tags,
		Genres:           v.Genres,
		Apl:              apl,
		SignupType:       v.SignupType,
		VoiceChannelID:   v.VoiceChannelId,
		CreatedBy:        v.CreatedBy,
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
		DisplayStatus:    v.DisplayStatus,
		Regions:          v.Regions,
	}
}

func toQuestListResult(v quest.QuestListResult) *QuestListResult {
	items := make([]*QuestType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestView(item)
	}
	return &QuestListResult{Items: items, Total: int(v.Total)}
}

func toQuestArcView(v quest.QuestArcView) *QuestArcType {
	return &QuestArcType{
		ID:         v.Id,
		Name:       v.Name,
		CreatedBy:  v.CreatedBy,
		CreatedAt:  v.CreatedAt,
		QuestCount: int(v.QuestCount),
	}
}

func toQuestArcListResult(v quest.QuestArcListResult) *QuestArcListResult {
	items := make([]*QuestArcType, 0, len(v.Items))
	for _, item := range v.Items {
		items = append(items, toQuestArcView(item))
	}
	return &QuestArcListResult{Items: items, Total: int(v.Total)}
}

func toMemberViewType(v member.MemberView) *MemberType {
	return &MemberType{
		ID:          v.Id,
		Handle:      v.Handle,
		DisplayName: v.DisplayName,
		Status:      v.Status,
		Roles:       v.Roles,
		AvatarURL:   v.AvatarUrl,
		DiscordID:   v.DiscordId,
		JoinedAt:    v.JoinedAt,
	}
}

func toMemberProfileInput(in UpdateMyProfileInput) member.UpdateMyProfileFields {
	out := member.UpdateMyProfileFields{DisplayName: in.DisplayName}
	if in.AvatarURL.IsSet() {
		out.AvatarUrl.Set = true
		out.AvatarUrl.Value = in.AvatarURL.Value()
	}
	return out
}

func toAvailabilitySlots(in []*AvailabilitySlotInput) []member.AvailabilitySlotFields {
	if len(in) == 0 {
		return nil
	}
	out := make([]member.AvailabilitySlotFields, len(in))
	for i, slot := range in {
		if slot == nil {
			continue
		}
		out[i] = member.AvailabilitySlotFields{
			Day:       slot.Day,
			StartTime: slot.StartTime,
			EndTime:   slot.EndTime,
			Note:      slot.Note,
		}
	}
	return out
}

func toDmProfileType(v *member.DmProfileView) *DmProfileType {
	if v == nil {
		return nil
	}
	var tableInfo json.RawMessage
	if v.TableInfo != nil {
		tableInfo = *v.TableInfo
	}
	return &DmProfileType{
		MemberID:         v.MemberId,
		Tagline:          v.Tagline,
		Philosophy:       v.Philosophy,
		HouseRules:       v.HouseRules,
		TableInfo:        tableInfo,
		AcceptingPlayers: v.AcceptingPlayers,
		Status:           v.Status,
		ReviewRevision:   int(v.ReviewRevision),
	}
}

func toMemberProfileType(v member.MemberProfileView) *MemberProfileType {
	return &MemberProfileType{
		Member:          toMemberViewType(v.Member),
		DmProfile:       toDmProfileType(v.DmProfile),
		Availability:    toAvailabilitySlotTypes(v.Availability),
		ActivitySummary: toActivitySummaryType(v.ActivitySummary),
		RecentWeeks:     []*WeekActivityType{},
	}
}

func toRoleChangeType(v member.RoleChangeView) *RoleChangeType {
	return &RoleChangeType{
		ID:         v.Id,
		MemberID:   v.MemberId,
		OldRoles:   v.OldRoles,
		NewRoles:   v.NewRoles,
		Note:       v.Note,
		ChangedBy:  v.ChangedBy,
		OccurredAt: v.OccurredAt,
	}
}

func toRoleChangePage(v member.RoleChangePage) *RoleChangePage {
	items := make([]*RoleChangeType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toRoleChangeType(item)
	}
	return &RoleChangePage{Items: items, Total: int(v.Total)}
}

func toCommunityDirectoryFilters(filters *CommunityDirectoryFiltersInput) *member.CommunityDirectoryFiltersFields {
	if filters == nil {
		return nil
	}
	return &member.CommunityDirectoryFiltersFields{
		Role:             filters.Role,
		AcceptingPlayers: filters.AcceptingPlayers,
		Search:           filters.Search,
		DmProfileStatus:  filters.DmProfileStatus,
	}
}

func toDirectoryEntryType(v member.DirectoryEntryView) *DirectoryEntryType {
	var tableInfo json.RawMessage
	if v.TableInfo != nil {
		tableInfo = *v.TableInfo
	}
	var rev *int
	if v.DmProfileReviewRevision != nil {
		i := int(*v.DmProfileReviewRevision)
		rev = &i
	}
	return &DirectoryEntryType{
		MemberID:                v.MemberId,
		Handle:                  v.Handle,
		DisplayName:             v.DisplayName,
		AvatarURL:               v.AvatarUrl,
		Roles:                   v.Roles,
		Status:                  v.Status,
		IsDm:                    v.IsDm,
		Tagline:                 v.Tagline,
		AcceptingPlayers:        v.AcceptingPlayers,
		DmProfileStatus:         v.DmProfileStatus,
		DmProfileReviewRevision: rev,
		TableInfo:               tableInfo,
		AvailableDays:           v.AvailableDays,
	}
}

func toCommunityDirectoryResult(v member.CommunityDirectoryResult) *CommunityDirectoryResult {
	entries := make([]*DirectoryEntryType, len(v.Entries))
	for i, e := range v.Entries {
		entries[i] = toDirectoryEntryType(e)
	}
	return &CommunityDirectoryResult{Entries: entries, Total: int(v.Total)}
}

func toDriverProgressType(v member.DriverProgressView) *DriverProgressType {
	return &DriverProgressType{
		TenureMonths:      int(v.TenureMonths),
		PlayerQuestsCount: int(v.PlayerQuestsCount),
		DmSessionsCount:   int(v.DmSessionsCount),
	}
}

func toMemberUnlockPage(v member.MemberUnlockPage) *MemberUnlockPage {
	items := make([]*MemberUnlockType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toMemberUnlockType(item)
	}
	return &MemberUnlockPage{
		Items:                items,
		Total:                int(v.Total),
		DriverProgress:       toDriverProgressType(v.DriverProgress),
		UnlockedAchievements: v.UnlockedAchievements,
		DmTier:               v.DmTier,
	}
}

func toUnlockablePage(v member.UnlockablePage) *UnlockablePage {
	items := make([]*UnlockableType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toUnlockableType(item)
	}
	return &UnlockablePage{Items: items, Total: int(v.Total)}
}

func toAvailabilitySlotTypes(slots []member.AvailabilitySlotView) []*AvailabilitySlotType {
	out := make([]*AvailabilitySlotType, len(slots))
	for i, slot := range slots {
		out[i] = &AvailabilitySlotType{
			Day:       slot.Day,
			StartTime: slot.StartTime,
			EndTime:   slot.EndTime,
			Note:      slot.Note,
		}
	}
	return out
}

func toMemberUnlockType(v member.MemberUnlockView) *MemberUnlockType {
	return &MemberUnlockType{
		MemberID:     v.MemberId,
		UnlockableID: v.UnlockableId,
		UnlockedAt:   v.UnlockedAt,
		Source:       v.Source,
		GrantedBy:    v.GrantedBy,
	}
}

func toMemberRoleBatchResults(items []member.MemberRoleBatchResultView) []*MemberRoleBatchResultType {
	out := make([]*MemberRoleBatchResultType, len(items))
	for i, item := range items {
		result := &MemberRoleBatchResultType{
			MemberID: item.MemberId,
			Ok:       item.Ok,
			Error:    item.Error,
		}
		if item.Member != nil {
			result.Member = toMemberViewType(*item.Member)
		}
		out[i] = result
	}
	return out
}

func optionalStringFromGraph(v gql.Omittable[*string]) product.Optional[string] {
	if !v.IsSet() {
		return product.Optional[string]{}
	}
	return product.Optional[string]{Set: true, Value: v.Value()}
}

func optionalBoolFromGraph(v gql.Omittable[*bool]) product.Optional[bool] {
	if !v.IsSet() {
		return product.Optional[bool]{}
	}
	return product.Optional[bool]{Set: true, Value: v.Value()}
}

func optionalThemeFromGraph(v gql.Omittable[*Theme]) product.Optional[member.Theme] {
	if !v.IsSet() {
		return product.Optional[member.Theme]{}
	}
	if v.Value() == nil {
		return product.Optional[member.Theme]{Set: true, Value: nil}
	}
	t := member.Theme(*v.Value())
	return product.Optional[member.Theme]{Set: true, Value: &t}
}

func optionalColorModeFromGraph(v gql.Omittable[*ColorMode]) product.Optional[member.ColorMode] {
	if !v.IsSet() {
		return product.Optional[member.ColorMode]{}
	}
	if v.Value() == nil {
		return product.Optional[member.ColorMode]{Set: true, Value: nil}
	}
	m := member.ColorMode(*v.Value())
	return product.Optional[member.ColorMode]{Set: true, Value: &m}
}

func optionalDensityFromGraph(v gql.Omittable[*Density]) product.Optional[member.Density] {
	if !v.IsSet() {
		return product.Optional[member.Density]{}
	}
	if v.Value() == nil {
		return product.Optional[member.Density]{Set: true, Value: nil}
	}
	d := member.Density(*v.Value())
	return product.Optional[member.Density]{Set: true, Value: &d}
}

func toMemberSettingsPatch(in MemberSettingsPatch) member.MemberSettingsPatch {
	return member.MemberSettingsPatch{
		Theme:                       optionalThemeFromGraph(in.Theme),
		Mode:                        optionalColorModeFromGraph(in.Mode),
		EffectsEnabled:              optionalBoolFromGraph(in.EffectsEnabled),
		ColorblindSafe:              optionalBoolFromGraph(in.ColorblindSafe),
		ReducedMotion:               optionalBoolFromGraph(in.ReducedMotion),
		Density:                     optionalDensityFromGraph(in.Density),
		Timezone:                    optionalStringFromGraph(in.Timezone),
		NotifyCharacterVerification: optionalBoolFromGraph(in.NotifyCharacterVerification),
		NotifyQuestSignup:           optionalBoolFromGraph(in.NotifyQuestSignup),
		NotifyDocumentActivity:      optionalBoolFromGraph(in.NotifyDocumentActivity),
		NotifyQuestScheduled:        optionalBoolFromGraph(in.NotifyQuestScheduled),
		NotifyDmMentioned:           optionalBoolFromGraph(in.NotifyDmMentioned),
	}
}

func toMemberActivityStatsType(v member.MemberActivityStatsView) *MemberActivityStatsType {
	return &MemberActivityStatsType{
		MemberID:            v.MemberID,
		VoiceMinutes:        v.VoiceMinutes,
		Messages:            v.Messages,
		QuestsPlayed:        int(v.QuestsPlayed),
		LongestSessionHours: v.LongestSessionHours,
		SummariesAuthored:   int(v.SummariesAuthored),
		LastMessageAt:       v.LastMessageAt,
		VoiceByChannel:      []*ChannelVoiceMinutesType{},
		RecentSessions:      []*ActivityEventType{},
	}
}

func toMyPrivateNotesType(v member.PrivateNotesView) *MyPrivateNotesType {
	return &MyPrivateNotesType{Body: v.Body, UpdatedAt: v.UpdatedAt}
}

func toMyPersonalizationType(v member.MyPersonalizationView) *MyPersonalizationType {
	out := &MyPersonalizationType{}
	if v.Settings != nil {
		out.Settings = toMemberSettingsType(*v.Settings)
	}
	return out
}

func toQuestParticipantFromQuest(v quest.QuestParticipantView) *QuestParticipantType {
	return &QuestParticipantType{
		QuestID:           v.QuestId,
		MemberID:          v.MemberId,
		CharacterID:       v.CharacterId,
		Status:            v.Status,
		Manual:            v.Manual,
		CreatedAt:         v.CreatedAt,
		UpdatedAt:         v.UpdatedAt,
		CharacterName:     v.CharacterName,
		MemberHandle:      v.MemberHandle,
		MemberDisplayName: v.MemberDisplayName,
		MemberAvatarURL:   v.MemberAvatarUrl,
		LastPlayedAt:      v.LastPlayedAt,
	}
}

func toQuestStateCountsFilters(filters *QuestStateCountsFiltersInput) *quest.QuestStateCountsFiltersFields {
	if filters == nil {
		return nil
	}
	return &quest.QuestStateCountsFiltersFields{
		Kind:     filters.Kind,
		DmId:     filters.DmID,
		RegionId: filters.RegionID,
		ArcId:    filters.ArcID,
		Tag:      filters.Tag,
	}
}

func toQuestStateCountsSpec(filters *QuestStateCountsFiltersInput) quest.QuestStateCountsSpec {
	spec := quest.QuestStateCountsSpec{Filters: toQuestStateCountsFilters(filters)}
	if filters != nil && filters.Tag != nil && *filters.Tag != "" {
		spec.TagFilterSet = true
		spec.TagVariants = []string{*filters.Tag}
	}
	return spec
}

func toQuestStateCountTypes(items []quest.QuestStateCountView) []*QuestStateCountType {
	out := make([]*QuestStateCountType, len(items))
	for i, item := range items {
		out[i] = &QuestStateCountType{State: item.State, Count: int(item.Count)}
	}
	return out
}

func toOpenQuestSeatType(v quest.OpenQuestSeatView) *OpenQuestSeatType {
	return &OpenQuestSeatType{
		QuestID:     v.QuestId,
		ShortCode:   v.ShortCode,
		DmID:        v.DmId,
		RegionIds:   v.RegionIds,
		ScheduledAt: v.ScheduledAt,
		Status:      v.Status,
		SlotsMax:    int(v.SlotsMax),
		FilledCount: int(v.FilledCount),
		OpenSeats:   int(v.OpenSeats),
	}
}

func toOpenQuestSeatsResult(v quest.OpenQuestSeatsResult) *OpenQuestSeatsResult {
	entries := make([]*OpenQuestSeatType, len(v.Entries))
	for i, e := range v.Entries {
		entries[i] = toOpenQuestSeatType(e)
	}
	return &OpenQuestSeatsResult{Entries: entries, Total: int(v.Total)}
}

func toQuestParticipationPage(v quest.ParticipationPage) *ParticipationPage {
	items := make([]*QuestParticipantType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestParticipantFromQuest(item)
	}
	return &ParticipationPage{Items: items, Total: int(v.Total)}
}

func toDmSummaryFilters(filters *DmSummaryFiltersInput) *quest.DmSummaryFiltersFields {
	if filters == nil {
		return nil
	}
	return &quest.DmSummaryFiltersFields{
		QuestId: filters.QuestID,
		Search:  filters.Search,
	}
}

func toQuestSummariesResult(v quest.QuestSummariesResult) *QuestSummariesResult {
	summaries := make([]*DocumentType, len(v.Summaries))
	for i, item := range v.Summaries {
		summaries[i] = toDocumentViewType(item)
	}
	var totalPcxp *int
	if v.Totals.TotalPcxpAwarded != nil {
		awarded := int(*v.Totals.TotalPcxpAwarded)
		totalPcxp = &awarded
	}
	return &QuestSummariesResult{
		Summaries: summaries,
		Totals: &QuestSummaryTotalsType{
			TotalPcxpAwarded: totalPcxp,
			Coverage:         RewardCoverage(v.Totals.Coverage),
		},
	}
}

func toDmLastSessionType(v *quest.DmLastSessionView) *DmLastSessionType {
	if v == nil {
		return nil
	}
	out := &DmLastSessionType{Quest: toQuestView(v.Quest)}
	if v.RecapDocument != nil {
		out.RecapDocument = toDocumentViewType(*v.RecapDocument)
	}
	return out
}

func toDmStatsType(v *quest.DmStatsView) *DmStatsType {
	if v == nil {
		return nil
	}
	return &DmStatsType{
		SessionCount: int(v.SessionCount),
		LastSession:  toDmLastSessionType(v.LastSession),
	}
}

func toDmSessionHistoryResult(v quest.DmSessionHistoryResult) *DmSessionHistoryResult {
	items := make([]*DmLastSessionType, len(v.Items))
	for i := range v.Items {
		items[i] = toDmLastSessionType(&v.Items[i])
	}
	return &DmSessionHistoryResult{Items: items, Total: int(v.Total)}
}

func toMemberSettingsType(v member.MemberSettingsView) *MemberSettingsType {
	return &MemberSettingsType{
		MemberID:                    v.MemberId,
		Theme:                       Theme(v.Theme),
		Mode:                        ColorMode(v.Mode),
		EffectsEnabled:              v.EffectsEnabled,
		ColorblindSafe:              v.ColorblindSafe,
		ReducedMotion:               v.ReducedMotion,
		Density:                     Density(v.Density),
		Timezone:                    v.Timezone,
		UpdatedAt:                   v.UpdatedAt,
		NotifyCharacterVerification: v.NotifyCharacterVerification,
		NotifyQuestSignup:           v.NotifyQuestSignup,
		NotifyDocumentActivity:      v.NotifyDocumentActivity,
		NotifyQuestScheduled:        v.NotifyQuestScheduled,
		NotifyDmMentioned:           v.NotifyDmMentioned,
	}
}

func toUpsertUnlockableFields(in UpsertUnlockableInput) member.UpsertUnlockableFields {
	var unlockRule *json.RawMessage
	if len(in.UnlockRule) > 0 {
		raw := json.RawMessage(in.UnlockRule)
		unlockRule = &raw
	}
	return member.UpsertUnlockableFields{
		Active:      in.Active,
		Description: in.Description,
		Kind:        member.UnlockKind(in.Kind),
		Name:        in.Name,
		Payload:     in.Payload,
		UnlockRule:  unlockRule,
	}
}

func toUnlockableType(v member.UnlockableView) *UnlockableType {
	var unlockRule json.RawMessage
	if v.UnlockRule != nil {
		unlockRule = *v.UnlockRule
	}
	return &UnlockableType{
		ID:          v.Id,
		Kind:        UnlockKind(v.Kind),
		Name:        v.Name,
		Description: v.Description,
		Payload:     v.Payload,
		UnlockRule:  unlockRule,
		Active:      v.Active,
	}
}

func toCharacterFilters(filters *CharacterFiltersInput) *character.CharacterFiltersFields {
	if filters == nil {
		return nil
	}
	return &character.CharacterFiltersFields{
		OwnerId:    filters.OwnerID,
		GuildId:    filters.GuildID,
		RegionId:   filters.RegionID,
		NamePrefix: filters.NamePrefix,
		Status:     filters.Status,
	}
}

func toCharacterView(v character.CharacterView) *CharacterType {
	var mirror *CharacterDDBMirrorType
	if v.DdbMirror != nil {
		mirror = &CharacterDDBMirrorType{
			CharacterID: v.DdbMirror.CharacterId,
			Level:       intPtrFromInt32(v.DdbMirror.Level), Xp: intPtrFromInt32(v.DdbMirror.Xp),
			ArmorClass: intPtrFromInt32(v.DdbMirror.ArmorClass), MaxHp: intPtrFromInt32(v.DdbMirror.MaxHp),
			Species: v.DdbMirror.Species, Classes: v.DdbMirror.Classes,
			Background: v.DdbMirror.Background, SyncedAt: v.DdbMirror.SyncedAt,
		}
	}
	proficiencies := make([]*DDBProficiencyType, len(v.Proficiencies))
	for i, proficiency := range v.Proficiencies {
		proficiencies[i] = &DDBProficiencyType{Kind: proficiency.Kind, Name: proficiency.Name}
	}
	return &CharacterType{
		ID:                      v.Id,
		OwnerID:                 v.OwnerId,
		ShortCode:               v.ShortCode,
		Name:                    v.Name,
		Status:                  v.Status,
		RegionID:                v.RegionId,
		GuildID:                 v.GuildId,
		BackstoryID:             v.BackstoryId,
		Pcxp:                    int(v.Pcxp),
		Description:             v.Description,
		BackgroundText:          v.BackgroundText,
		DdbURL:                  v.DdbUrl,
		DdbMirror:               mirror,
		Proficiencies:           proficiencies,
		CreatedAt:               v.CreatedAt,
		UpdatedAt:               v.UpdatedAt,
		VerificationSubmittedAt: v.VerificationSubmittedAt,
		VerificationStatus:      CharacterReviewStatus(v.VerificationStatus),
		DisplayIcon:             v.DisplayIcon,
		ImageURL:                v.ImageUrl,
		DaysActive:              int(v.DaysActive),
	}
}

func toCharacterListResult(v character.CharacterListResult) *CharacterListResult {
	items := make([]*CharacterType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCharacterView(item)
	}
	return &CharacterListResult{Items: items, Total: int(v.Total)}
}

func toBackstoryFilters(filters *BackstoryFiltersInput) *character.BackstoryFiltersFields {
	if filters == nil {
		return nil
	}
	return &character.BackstoryFiltersFields{
		Cohort:         filters.Cohort,
		RegionId:       filters.RegionID,
		IncludeRetired: filters.IncludeRetired,
	}
}

func toBackstoryType(v character.BackstoryView) *BackstoryType {
	return &BackstoryType{
		ID:             v.Id,
		Name:           v.Name,
		Lore:           v.Lore,
		Cohort:         v.Cohort,
		SourceRegionID: v.SourceRegionId,
		Retired:        v.Retired,
	}
}

func toBackstoryPage(v character.BackstoryPage) *BackstoryPage {
	items := make([]*BackstoryType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toBackstoryType(item)
	}
	return &BackstoryPage{Items: items, Total: int(v.Total)}
}

func toCreationCatalogFilters(filters *CreationCatalogFiltersInput) *character.CreationCatalogFiltersFields {
	if filters == nil {
		return nil
	}
	return &character.CreationCatalogFiltersFields{
		Kind:       filters.Kind,
		RegionId:   filters.RegionID,
		IncludeAll: filters.IncludeAll,
	}
}

func toCreationCatalogEntryType(v character.CreationCatalogEntryView) *CreationCatalogEntryType {
	return &CreationCatalogEntryType{
		ID:                   v.Id,
		Kind:                 v.Kind,
		Name:                 v.Name,
		Description:          v.Description,
		Available:            v.Available,
		Retired:              v.Retired,
		IntroducedByRegionID: v.IntroducedByRegionId,
	}
}

func toCreationCatalogPage(v character.CreationCatalogPage) *CreationCatalogPage {
	items := make([]*CreationCatalogEntryType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCreationCatalogEntryType(item)
	}
	return &CreationCatalogPage{Items: items, Total: int(v.Total)}
}

func toProgressionEntryType(v character.ProgressionEntryView) *ProgressionEntryType {
	var amount *int
	if v.Amount != nil {
		i := int(*v.Amount)
		amount = &i
	}
	return &ProgressionEntryType{
		ID:          v.Id,
		CharacterID: v.CharacterId,
		Kind:        v.Kind,
		Amount:      amount,
		QuestID:     v.QuestId,
		Note:        v.Note,
		RecordedBy:  v.RecordedBy,
		RecordedAt:  v.RecordedAt,
	}
}

func toProgressionListResult(v character.ProgressionListResult) *ProgressionListResult {
	items := make([]*ProgressionEntryType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toProgressionEntryType(item)
	}
	return &ProgressionListResult{Items: items, Total: int(v.Total)}
}

func toCharacterLogType(v character.CharacterLogView) *CharacterLogType {
	return &CharacterLogType{
		ID:          v.Id,
		CharacterID: v.CharacterId,
		Body:        v.Body,
		QuestID:     v.QuestId,
		CreatedBy:   v.CreatedBy,
		CreatedAt:   v.CreatedAt,
	}
}

func toCharacterLogListResult(v character.CharacterLogListResult) *CharacterLogListResult {
	items := make([]*CharacterLogType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCharacterLogType(item)
	}
	return &CharacterLogListResult{Items: items, Total: int(v.Total)}
}

func toDowntimeProjectType(v character.DowntimeProjectView) *DowntimeProjectType {
	var target *int
	if v.Target != nil {
		i := int(*v.Target)
		target = &i
	}
	return &DowntimeProjectType{
		ID:          v.Id,
		CharacterID: v.CharacterId,
		Name:        v.Name,
		Goal:        v.Goal,
		Progress:    int(v.Progress),
		Target:      target,
		Status:      v.Status,
		Notes:       v.Notes,
		UpdatedAt:   v.UpdatedAt,
	}
}

func toDowntimeProjectListResult(v character.DowntimeProjectListResult) *DowntimeProjectListResult {
	items := make([]*DowntimeProjectType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toDowntimeProjectType(item)
	}
	return &DowntimeProjectListResult{Items: items, Total: int(v.Total)}
}

func toCoPlayerType(v character.CoPlayerView) *CoPlayerType {
	return &CoPlayerType{
		CharacterID: v.CharacterId,
		MemberID:    v.MemberId,
		QuestCount:  int(v.QuestCount),
	}
}

func toCoPlayerPage(v character.CoPlayerPage) *CoPlayerPage {
	items := make([]*CoPlayerType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCoPlayerType(item)
	}
	return &CoPlayerPage{Items: items, Total: int(v.Total)}
}

func toQuestParticipantType(v character.ParticipationView) *QuestParticipantType {
	return &QuestParticipantType{
		QuestID:           v.QuestID,
		MemberID:          v.MemberID,
		CharacterID:       v.CharacterID,
		Status:            v.Status,
		Manual:            v.Manual,
		CreatedAt:         v.CreatedAt,
		UpdatedAt:         v.UpdatedAt,
		CharacterName:     v.CharacterName,
		MemberHandle:      v.MemberHandle,
		MemberDisplayName: v.MemberDisplayName,
		MemberAvatarURL:   v.MemberAvatarURL,
	}
}

func toParticipationPage(v character.ParticipationPageView) *ParticipationPage {
	items := make([]*QuestParticipantType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestParticipantType(item)
	}
	return &ParticipationPage{Items: items, Total: int(v.Total)}
}

func toVerificationType(v member.VerificationView) *VerificationType {
	return &VerificationType{
		ID:         v.Id,
		TargetType: v.TargetType,
		TargetID:   v.TargetId,
		Verdict:    v.Verdict,
		Note:       v.Note,
		VerifiedBy: v.VerifiedBy,
		RecordedAt: v.RecordedAt,
	}
}

func toVerificationPage(v member.VerificationPage) *VerificationPage {
	items := make([]*VerificationType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toVerificationType(item)
	}
	return &VerificationPage{Items: items, Total: int(v.Total)}
}

func toDocumentViewType(v document.DocumentView) *DocumentType {
	fm := v.Frontmatter
	if len(fm) == 0 {
		fm = json.RawMessage("{}")
	}
	return &DocumentType{
		CanEditBody:     v.CanEditBody,
		CanEditMetadata: v.CanEditMetadata,
		ID:              v.Id,
		Version:         int(v.Version),
		Slug:            v.Slug,
		Kind:            v.Kind,
		Category:        v.Category,
		Status:          v.Status,
		Visibility:      v.Visibility,
		Policy:          v.Policy,
		Title:           v.Title,
		Frontmatter:     fm,
		AuthorID:        v.AuthorId,
		UpdatedAt:       v.UpdatedAt,
		DeletedAt:       v.DeletedAt,
		DeletedBy:       v.DeletedBy,
		EffectiveBody:   v.EffectiveBody,
		PublishedAt:     v.PublishedAt,
	}
}

func toDocumentListResult(v document.DocumentListResult) *DocumentListResult {
	items := make([]*DocumentType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toDocumentViewType(item)
	}
	return &DocumentListResult{Items: items, Total: int(v.Total)}
}

func toDocumentFilters(filters *DocumentFiltersInput) *document.DocumentFiltersFields {
	if filters == nil {
		return nil
	}
	return &document.DocumentFiltersFields{
		Category:   filters.Category,
		CreatedBy:  filters.CreatedBy,
		Kind:       filters.Kind,
		Region:     filters.Region,
		Search:     filters.Search,
		Status:     filters.Status,
		Visibility: filters.Visibility,
	}
}

func toDocumentLinkTypes(links []document.DocumentLinkView) []*DocumentLinkType {
	out := make([]*DocumentLinkType, 0, len(links))
	for _, l := range links {
		out = append(out, &DocumentLinkType{
			DocumentID: l.DocumentId,
			TargetType: l.TargetType,
			TargetID:   l.TargetId,
			Relation:   l.Relation,
		})
	}
	return out
}

func toCodexDirectoryResult(v document.CodexDirectoryResult) *CodexDirectoryResult {
	items := make([]*DocumentType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toDocumentViewType(item)
	}
	return &CodexDirectoryResult{Items: items, Total: int(v.Total)}
}

func toCategoryCountTypes(items []document.CategoryCountView) []*CategoryCountType {
	out := make([]*CategoryCountType, len(items))
	for i, item := range items {
		out[i] = &CategoryCountType{Category: item.Category, Count: int(item.Count)}
	}
	return out
}

func toCodexEntryCardType(v *document.CodexEntryCardView) *CodexEntryCardType {
	if v == nil {
		return nil
	}
	return &CodexEntryCardType{
		Document:      toDocumentViewType(v.Document),
		BacklinkCount: int(v.BacklinkCount),
	}
}

func intPtrFromInt32(v *int32) *int {
	if v == nil {
		return nil
	}
	n := int(*v)
	return &n
}

func toAdminDeliveryJobType(v site.AdminDeliveryJobView) *AdminDeliveryJobType {
	return &AdminDeliveryJobType{
		ID:              v.Id,
		QuestID:         v.QuestId,
		QuestShortCode:  v.QuestShortCode,
		QuestTitle:      v.QuestTitle,
		QuestLink:       v.QuestLink,
		EventLink:       v.EventLink,
		MessageID:       v.MessageId,
		State:           v.State,
		DesiredRevision: intPtrFromInt32(v.DesiredRevision),
		AppliedRevision: intPtrFromInt32(v.AppliedRevision),
		FailureStreak:   int(v.FailureStreak),
		MaxAttempts:     int(v.MaxAttempts),
		NextAttemptAt:   v.NextAttemptAt,
		SafeError:       v.SafeError,
		RedriveCount:    int(v.RedriveCount),
		CreatedAt:       v.CreatedAt,
		UpdatedAt:       v.UpdatedAt,
	}
}

func toAdminDeliveryConfigType(v site.AdminDeliveryConfigView) *AdminDeliveryConfigType {
	return &AdminDeliveryConfigType{
		PublicOrigin:            v.PublicOrigin,
		PublicOriginHealthy:     v.PublicOriginHealthy,
		DeliveryMode:            v.DeliveryMode,
		AnnouncementRoleID:      v.AnnouncementRoleId,
		AnnouncementRoleSource:  v.AnnouncementRoleSource,
		AnnouncementRoleHealthy: v.AnnouncementRoleHealthy,
	}
}

func toScheduledWorkStatusTypes(items []site.ScheduledWorkStatusView) []*ScheduledWorkStatusType {
	out := make([]*ScheduledWorkStatusType, len(items))
	for i, item := range items {
		out[i] = &ScheduledWorkStatusType{
			Kind:           item.Kind,
			ExpectedSlot:   item.ExpectedSlot,
			Outcome:        item.Outcome,
			LastStartedAt:  item.LastStartedAt,
			LastFinishedAt: item.LastFinishedAt,
			JobID:          item.JobId,
			SafeErrorCode:  item.SafeErrorCode,
		}
	}
	return out
}

func toAdminOperationsType(v site.AdminOperationsView) *AdminOperationsType {
	deliveries := make([]*AdminDeliveryJobType, len(v.Deliveries))
	for i, job := range v.Deliveries {
		deliveries[i] = toAdminDeliveryJobType(job)
	}
	return &AdminOperationsType{
		ScheduledWork:         toScheduledWorkStatusTypes(v.ScheduledWork),
		Config:                toAdminDeliveryConfigType(v.Config),
		ActiveAlertCount:      int(v.ActiveAlertCount),
		PendingDeliveryCount:  int(v.PendingDeliveryCount),
		TerminalDeliveryCount: int(v.TerminalDeliveryCount),
		DeliveryTotal:         int(v.DeliveryTotal),
		Deliveries:            deliveries,
	}
}

func toAdminCharacterDirectoryFilters(filters *AdminCharacterDirectoryFiltersInput) *character.AdminCharacterDirectoryFiltersFields {
	if filters == nil {
		return nil
	}
	return &character.AdminCharacterDirectoryFiltersFields{
		NamePrefix: filters.NamePrefix,
		RegionId:   filters.RegionID,
		Status:     filters.Status,
	}
}

func toAdminCharacterDirectoryEntryType(v character.AdminCharacterDirectoryEntryView) *AdminCharacterDirectoryEntryType {
	return &AdminCharacterDirectoryEntryType{
		ID:                      v.Id,
		ShortCode:               v.ShortCode,
		Name:                    v.Name,
		OwnerID:                 v.OwnerId,
		OwnerHandle:             v.OwnerHandle,
		OwnerDisplayName:        v.OwnerDisplayName,
		OwnerAvatarURL:          v.OwnerAvatarUrl,
		RegionID:                v.RegionId,
		RegionName:              v.RegionName,
		GuildID:                 v.GuildId,
		Status:                  v.Status,
		VerificationStatus:      string(v.VerificationStatus),
		VerificationSubmittedAt: v.VerificationSubmittedAt,
		DdbURL:                  v.DdbUrl,
		DdbSyncedAt:             v.DdbSyncedAt,
		UpdatedAt:               v.UpdatedAt,
	}
}

func toAdminCharacterDirectoryType(v character.AdminCharacterDirectoryView) *AdminCharacterDirectoryType {
	items := make([]*AdminCharacterDirectoryEntryType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toAdminCharacterDirectoryEntryType(item)
	}
	return &AdminCharacterDirectoryType{Items: items, Total: int(v.Total)}
}

func toCountByKeyTypes(items []site.CountByKeyView) []*CountByKeyType {
	out := make([]*CountByKeyType, len(items))
	for i, item := range items {
		out[i] = &CountByKeyType{Key: item.Key, Count: int(item.Count)}
	}
	return out
}

func toActivitySummaryType(v member.ActivitySummaryView) *ActivitySummaryType {
	return &ActivitySummaryType{
		VoiceMinutes: v.VoiceMinutes,
		Messages:     v.Messages,
		Reactions:    v.Reactions,
	}
}

func toSiteStatsView(v site.SiteStatsView) *SiteStatsType {
	return &SiteStatsType{
		TotalMembers:     int(v.TotalMembers),
		MembersByRole:    toCountByKeyTypes(v.MembersByRole),
		ActiveCharacters: int(v.ActiveCharacters),
		TotalMaps:        int(v.TotalMaps),
		TotalRegions:     int(v.TotalRegions),
		TotalQuests:      int(v.TotalQuests),
		TotalDms:         int(v.TotalDms),
		Activity:         toActivitySummaryType(v.Activity),
	}
}

func toAdminCommunityStats(v site.AdminCommunityStats) *AdminCommunityStatsType {
	classes := make([]*CountByKeyType, len(v.Classes))
	for i, row := range v.Classes {
		classes[i] = &CountByKeyType{Key: row.Name, Count: int(row.Count)}
	}
	hexes := make([]*AdminQuestHexCountType, len(v.QuestHexes))
	for i, row := range v.QuestHexes {
		hexes[i] = &AdminQuestHexCountType{ID: row.ID, Name: row.Name, MapName: row.MapName, QuestCount: int(row.QuestCount)}
	}
	return &AdminCommunityStatsType{TotalCharacters: int(v.TotalCharacters), CharactersByClass: classes, QuestHexes: hexes}
}

func toSiteStatsFromSnapshot(snapshot site.CommunityStatsSnapshot) *SiteStatsType {
	return toSiteStatsView(site.SiteStatsView{
		TotalMembers:     snapshot.TotalMembers,
		MembersByRole:    snapshot.MembersByRole,
		ActiveCharacters: snapshot.ActiveCharacters,
		TotalMaps:        snapshot.TotalMaps,
		TotalRegions:     snapshot.TotalRegions,
		TotalQuests:      snapshot.TotalQuests,
		TotalDms:         snapshot.TotalDMs,
		Activity:         snapshot.Activity,
	})
}

func toHomeView(v site.HomeView) *HomeType {
	buckets := make([]*HomeBucketType, len(v.RecentByCategory))
	for i, bucket := range v.RecentByCategory {
		docs := make([]*DocumentType, len(bucket.Documents))
		for j, doc := range bucket.Documents {
			docs[j] = toDocumentViewType(doc)
		}
		buckets[i] = &HomeBucketType{Category: bucket.Category, Documents: docs}
	}
	return &HomeType{
		RecentByCategory: buckets,
		CommunityStats:   toSiteStatsView(v.CommunityStats),
	}
}

func toMemberListResult(v member.MemberListResult) *MemberListResult {
	items := make([]*MemberType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toMemberViewType(item)
	}
	return &MemberListResult{Items: items, Total: int(v.Total)}
}

func toMembersSpec(filters *MemberFiltersInput, sort *MemberSortInput, limit, offset int) member.MembersSpec {
	spec := member.MembersSpec{Limit: int32(limit), Offset: int32(offset)}
	if filters != nil {
		spec.Filters = &member.MemberFiltersFields{
			Role:   filters.Role,
			Status: filters.Status,
			Search: filters.Search,
		}
	}
	if sort != nil {
		s := member.MemberSortInput(*sort)
		spec.Sort = &s
	}
	return spec
}

func toNotificationType(v notification.NotificationView) *NotificationType {
	label := v.Label
	if label == "" {
		label = v.Kind
	}
	return &NotificationType{
		ID:          v.Id,
		Kind:        v.Kind,
		SubjectType: v.SubjectType,
		SubjectID:   v.SubjectId,
		CreatedAt:   v.CreatedAt,
		ReadAt:      v.ReadAt,
		Title:       v.Title,
		Summary:     v.Summary,
		Label:       label,
		SubjectCode: v.SubjectCode,
	}
}

func toNotificationConnectionType(conn notification.NotificationConnection) *NotificationConnection {
	items := make([]*NotificationType, 0, len(conn.Items))
	for _, item := range conn.Items {
		items = append(items, toNotificationType(item))
	}
	return &NotificationConnection{
		HasMore:    conn.HasMore,
		NextBefore: conn.NextBefore,
		Items:      items,
	}
}

func toCommandReceipt(r product.CommandReceipt) *CommandReceipt {
	return &CommandReceipt{Replayed: r.Replayed}
}

func toDdbSyncReceipt(r character.DdbSyncReceipt) *DdbSyncReceipt {
	return &DdbSyncReceipt{
		Character:   toCharacterView(r.Character),
		Succeeded:   r.Succeeded,
		AttemptedAt: r.AttemptedAt,
		SafeError:   r.SafeError,
	}
}

func toCreateCharacterFields(in CreateCharacterInput) character.CreateCharacterFields {
	picks := in.CatalogPickIds
	if picks == nil {
		picks = []string{}
	}
	return character.CreateCharacterFields{
		Name:           in.Name,
		RegionId:       in.RegionID,
		BackstoryId:    in.BackstoryID,
		CatalogPickIds: picks,
		GuildId:        in.GuildID,
		Description:    in.Description,
		BackgroundText: in.BackgroundText,
		DdbUrl:         in.DdbURL,
		ImageUrl:       in.ImageURL,
		ShortCode:      in.ShortCode,
	}
}

func toUpdateCharacterProfileFields(in UpdateCharacterProfileInput) character.UpdateCharacterProfileFields {
	out := character.UpdateCharacterProfileFields{}
	if in.Description.IsSet() {
		out.Description.Set = true
		out.Description.Value = in.Description.Value()
	}
	if in.BackgroundText.IsSet() {
		out.BackgroundText.Set = true
		out.BackgroundText.Value = in.BackgroundText.Value()
	}
	if in.ImageURL.IsSet() {
		out.ImageUrl.Set = true
		out.ImageUrl.Value = in.ImageURL.Value()
	}
	return out
}

func toDowntimeFields(in DowntimeInput) character.DowntimeFields {
	var target *int32
	if in.Target != nil {
		v := int32(*in.Target)
		target = &v
	}
	return character.DowntimeFields{
		Id:       in.ID,
		Name:     in.Name,
		Goal:     in.Goal,
		Target:   target,
		Progress: int32(in.Progress),
		Status:   in.Status,
		Notes:    in.Notes,
	}
}

func toBackstoryFields(in BackstoryInput) character.BackstoryFields {
	return character.BackstoryFields{
		Name:           in.Name,
		Lore:           in.Lore,
		Cohort:         in.Cohort,
		SourceRegionId: in.SourceRegionID,
		Retired:        in.Retired,
	}
}

func toUpsertCreationCatalogEntryFields(in UpsertCreationCatalogEntryInput) character.UpsertCreationCatalogEntryFields {
	return character.UpsertCreationCatalogEntryFields{
		Kind:                 in.Kind,
		Name:                 in.Name,
		OptionId:             in.OptionID,
		Description:          in.Description,
		Available:            in.Available,
		Retired:              in.Retired,
		IntroducedByRegionId: in.IntroducedByRegionID,
	}
}

func toVerificationVerdict(v VerificationVerdict) member.VerificationVerdict {
	return member.VerificationVerdict(v)
}

func optionalString(o gql.Omittable[*string]) product.Optional[string] {
	if !o.IsSet() {
		return product.Optional[string]{}
	}
	return product.Optional[string]{Set: true, Value: o.Value()}
}

func optionalRawMessage(o gql.Omittable[json.RawMessage]) product.Optional[json.RawMessage] {
	if !o.IsSet() {
		return product.Optional[json.RawMessage]{}
	}
	v := o.Value()
	if len(v) == 0 || string(v) == "null" {
		return product.Optional[json.RawMessage]{Set: true}
	}
	return product.Optional[json.RawMessage]{Set: true, Value: &v}
}

func toDocumentDraftFields(in DocumentDraftInput) document.DocumentDraftFields {
	fm := in.Frontmatter
	if len(fm) == 0 {
		fm = json.RawMessage("{}")
	}
	return document.DocumentDraftFields{
		Kind:        in.Kind,
		Category:    in.Category,
		Title:       in.Title,
		Body:        in.Body,
		Frontmatter: fm,
		Visibility:  in.Visibility,
		Policy:      in.Policy,
	}
}

func toDocumentEditFields(in DocumentEditInput) document.DocumentEditFields {
	return document.DocumentEditFields{
		ExpectedRevision: int32(in.ExpectedRevision),
		Title:            optionalString(in.Title),
		Body:             optionalString(in.Body),
		Frontmatter:      optionalRawMessage(in.Frontmatter),
		Category:         optionalString(in.Category),
	}
}

func toDocumentAudienceFields(in DocumentAudienceInput) document.DocumentAudienceFields {
	return document.DocumentAudienceFields{
		Visibility: in.Visibility,
		Policy:     optionalStringSlice(in.Policy),
		ReaderIds:  in.ReaderIds,
	}
}

func toDocumentRevisionType(v document.DocumentRevisionView) *DocumentRevisionType {
	fm := v.Frontmatter
	if len(fm) == 0 {
		fm = json.RawMessage("{}")
	}
	return &DocumentRevisionType{
		Reason:      v.Reason,
		RecordedAt:  v.RecordedAt,
		RecordedBy:  v.RecordedBy,
		ID:          v.Id,
		DocumentID:  v.DocumentId,
		Rev:         int(v.Rev),
		Title:       v.Title,
		Frontmatter: fm,
		Body:        v.Body,
		Visibility:  v.Visibility,
		PublishedAt: v.PublishedAt,
		PublishedBy: v.PublishedBy,
	}
}

func toDocumentRevisionPage(v document.DocumentRevisionPage) *DocumentRevisionPage {
	items := make([]*DocumentRevisionType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toDocumentRevisionType(item)
	}
	return &DocumentRevisionPage{Items: items, Total: int(v.Total)}
}

func toLieutenantAssignmentType(v document.LieutenantAssignmentView) *LieutenantAssignmentType {
	return &LieutenantAssignmentType{
		MemberID:      v.MemberId,
		NpcDocumentID: v.NpcDocumentId,
		GrantedAt:     v.GrantedAt,
		GrantedBy:     v.GrantedBy,
	}
}

func toLieutenantPage(v document.LieutenantPage) *LieutenantPage {
	items := make([]*LieutenantAssignmentType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toLieutenantAssignmentType(item)
	}
	return &LieutenantPage{Items: items, Total: int(v.Total)}
}

func toPreviewAudience(v PreviewAudience) document.PreviewAudience {
	return document.PreviewAudience(v)
}

func toBodySpanAudits(records []document.BodySpanAudit) []*BodySpanAudit {
	out := make([]*BodySpanAudit, len(records))
	for i, v := range records {
		out[i] = &BodySpanAudit{
			StartLine:   v.StartLine,
			EndLine:     v.EndLine,
			Kind:        BodySpanKind(v.Kind),
			Handle:      v.Handle,
			Suggestion:  v.Suggestion,
			Token:       v.Token,
			TokenLine:   v.TokenLine,
			TokenColumn: v.TokenColumn,
		}
	}
	return out
}

func toMapViewType(v spatial.MapView) *MapType {
	return &MapType{
		ID:        v.Id,
		CanEdit:   v.CanEdit,
		Name:      v.Name,
		AtlasCode: v.AtlasCode,
		Family:    v.Family,
		Grid:      v.Grid,
		MapKind:   v.MapKind,
		AssetPath: v.AssetPath,
		RegionID:  v.RegionId,
		CreatedBy: v.CreatedBy,
		CreatedAt: v.CreatedAt,
	}
}

func toRegionViewType(v spatial.RegionView) *RegionType {
	return &RegionType{
		CanCreateMap:    v.CanCreateMap,
		ID:              v.Id,
		Name:            v.Name,
		Kind:            v.Kind,
		CharterDeadline: v.CharterDeadline,
		DocumentID:      v.DocumentId,
		CreatedAt:       v.CreatedAt,
	}
}

func toArchonAssignmentType(v spatial.ArchonAssignmentView) *ArchonAssignmentType {
	return &ArchonAssignmentType{
		MemberID:  v.MemberId,
		RegionID:  v.RegionId,
		GrantedAt: v.GrantedAt,
		GrantedBy: v.GrantedBy,
	}
}

func toArchonPage(v spatial.ArchonPage) *ArchonPage {
	items := make([]*ArchonAssignmentType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toArchonAssignmentType(item)
	}
	return &ArchonPage{Items: items, Total: int(v.Total)}
}

func toRegionCountsType(v spatial.RegionCountsView) *RegionCountsType {
	return &RegionCountsType{
		RegionID:            v.RegionId,
		QuestCount:          int(v.QuestCount),
		PointcrawlNodeCount: int(v.FeatureCount),
		FeatureCount:        int(v.HexCount),
	}
}

func toRegionActivityQuestRef(v spatial.RegionActivityQuestRefView) *RegionActivityQuestRefType {
	return &RegionActivityQuestRefType{
		ID:          v.Id,
		ShortCode:   v.ShortCode,
		ScheduledAt: v.ScheduledAt,
		SlotsMax:    int(v.SlotsMax),
		FilledCount: int(v.FilledCount),
	}
}

func toRegionActivityType(v spatial.RegionActivityView) *RegionActivityType {
	openQuests := make([]*RegionActivityQuestRefType, len(v.OpenQuests))
	for i, item := range v.OpenQuests {
		openQuests[i] = toRegionActivityQuestRef(item)
	}
	liveQuests := make([]*RegionActivityQuestRefType, len(v.LiveQuests))
	for i, item := range v.LiveQuests {
		liveQuests[i] = toRegionActivityQuestRef(item)
	}
	return &RegionActivityType{
		RegionID:       v.RegionId,
		RegionName:     v.RegionName,
		FillingCount:   int(v.FillingCount),
		ScheduledCount: int(v.ScheduledCount),
		LiveCount:      int(v.LiveCount),
		OpenQuests:     openQuests,
		LiveQuests:     liveQuests,
	}
}

func toGameDateType(v *product.GameDateView) *GameDateType {
	if v == nil {
		return nil
	}
	return &GameDateType{
		EraAbbrev:   v.EraAbbrev,
		Year:        int(v.Year),
		PeriodName:  v.PeriodName,
		PeriodIndex: int(v.PeriodIndex),
		PeriodType:  v.PeriodType,
		Day:         int(v.Day),
	}
}

func toRealDatePage(v spatial.RealDatePage) *RealDatePage {
	return &RealDatePage{Items: v.Items, Total: int(v.Total)}
}

func toTimeAnchorType(v spatial.TimeAnchorView) *TimeAnchorType {
	return &TimeAnchorType{
		ID:       v.Id,
		RealUtc:  v.RealUtc,
		EpochDay: int(v.EpochDay),
		Rate:     v.Rate,
		Note:     v.Note,
	}
}

func toTimeAnchorPage(v spatial.TimeAnchorPage) *TimeAnchorPage {
	items := make([]*TimeAnchorType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toTimeAnchorType(item)
	}
	return &TimeAnchorPage{Items: items, Total: int(v.Total)}
}

func toGameCalendarType(v spatial.GameCalendarView) *GameCalendarType {
	var definition json.RawMessage
	if v.Definition != nil {
		definition = *v.Definition
	}
	var currentGameDay *int
	if v.CurrentGameDay != nil {
		d := int(*v.CurrentGameDay)
		currentGameDay = &d
	}
	grid := make([]*GameDayCellType, len(v.MonthGrid))
	for i, cell := range v.MonthGrid {
		var gameDay *int
		if cell.GameDay != nil {
			d := int(*cell.GameDay)
			gameDay = &d
		}
		grid[i] = &GameDayCellType{RealDate: cell.RealDate, GameDay: gameDay}
	}
	return &GameCalendarType{
		Definition:     definition,
		CurrentGameDay: currentGameDay,
		MonthGrid:      grid,
	}
}

func toPointcrawlNodeType(v spatial.PointcrawlNodeView) *PointcrawlNodeType {
	return &PointcrawlNodeType{
		ID:        v.Id,
		MapID:     v.MapId,
		X:         v.X,
		Y:         v.Y,
		Name:      v.Name,
		State:     toPointcrawlNodeState(v.State),
		SubmapID:  v.SubmapId,
		CreatedAt: v.CreatedAt,
	}
}

// toPointcrawlNodeState maps the stored lower-case state onto the wire enum. An unrecognized
// stored value cannot pass the column check, so it falls back to the column default.
func toPointcrawlNodeState(v string) PointcrawlNodeState {
	switch v {
	case spatial.PointcrawlNodeUnlocked:
		return PointcrawlNodeStateUnlocked
	case spatial.PointcrawlNodeMapped:
		return PointcrawlNodeStateMapped
	default:
		return PointcrawlNodeStateLocked
	}
}

// toSpatialPointcrawlNodeState maps the wire enum onto the stored value. gqlgen has already
// rejected values outside the enum; anything else maps to "" and the command rejects it.
func toSpatialPointcrawlNodeState(v PointcrawlNodeState) string {
	switch v {
	case PointcrawlNodeStateLocked:
		return spatial.PointcrawlNodeLocked
	case PointcrawlNodeStateUnlocked:
		return spatial.PointcrawlNodeUnlocked
	case PointcrawlNodeStateMapped:
		return spatial.PointcrawlNodeMapped
	default:
		return ""
	}
}

func toPointcrawlEdgeType(v spatial.PointcrawlEdgeView) *PointcrawlEdgeType {
	return &PointcrawlEdgeType{
		ID:         v.Id,
		MapID:      v.MapId,
		NodeA:      v.NodeA,
		NodeB:      v.NodeB,
		Directed:   v.Directed,
		Kind:       v.Kind,
		Label:      v.Label,
		DocumentID: v.DocumentId,
	}
}

func toPointcrawlEntryLinkType(v spatial.PointcrawlEntryLinkView) *PointcrawlEntryLinkType {
	return &PointcrawlEntryLinkType{
		MapID:      v.MapId,
		NodeID:     v.NodeId,
		DocumentID: v.DocumentId,
		Relation:   v.Relation,
		CreatedAt:  v.CreatedAt,
		CreatedBy:  v.CreatedBy,
	}
}

func toMapCreateFields(in MapCreateInput) spatial.MapCreateFields {
	return spatial.MapCreateFields{
		Name:      in.Name,
		AtlasCode: in.AtlasCode,
		Family:    in.Family,
		Grid:      in.Grid,
		MapKind:   in.MapKind,
		RegionId:  in.RegionID,
		AssetPath: in.AssetPath,
	}
}

func toMapUpdateFields(in MapUpdateInput) spatial.MapUpdateFields {
	return spatial.MapUpdateFields{
		Name:      in.Name,
		Family:    in.Family,
		Grid:      in.Grid,
		AssetPath: in.AssetPath,
	}
}

func toRegionFields(in RegionInput) spatial.RegionFields {
	return spatial.RegionFields{
		Name:            in.Name,
		Kind:            in.Kind,
		CharterDeadline: in.CharterDeadline,
		DocumentId:      in.DocumentID,
	}
}

func toTimeAnchorFields(in TimeAnchorInput) spatial.TimeAnchorFields {
	return spatial.TimeAnchorFields{
		RealUtc:  in.RealUtc,
		EpochDay: int32(in.EpochDay),
		Rate:     in.Rate,
		Note:     in.Note,
	}
}

func toPointcrawlNodeFields(in PointcrawlNodeInput) spatial.PointcrawlNodeFields {
	return spatial.PointcrawlNodeFields{
		Id:       in.ID,
		X:        in.X,
		Y:        in.Y,
		Name:     in.Name,
		SubmapId: in.SubmapID,
	}
}

func toPointcrawlEdgeFields(in PointcrawlEdgeInput) spatial.PointcrawlEdgeFields {
	return spatial.PointcrawlEdgeFields{
		Id:         in.ID,
		NodeA:      in.NodeA,
		NodeB:      in.NodeB,
		Directed:   in.Directed,
		Kind:       in.Kind,
		Label:      in.Label,
		DocumentId: in.DocumentID,
	}
}

func toHomeBannerFields(in HomeBannerInput) site.HomeBannerFields {
	return site.HomeBannerFields{
		Enabled:    in.Enabled,
		Title:      in.Title,
		Body:       in.Body,
		CtaLabel:   in.CtaLabel,
		CtaHref:    in.CtaHref,
		MediaKind:  in.MediaKind,
		MediaUrl:   in.MediaURL,
		MediaLabel: in.MediaLabel,
	}
}

func toHomeBannerType(v site.HomeBannerView) *HomeBannerType {
	return &HomeBannerType{
		Enabled:    v.Enabled,
		Title:      v.Title,
		Body:       v.Body,
		CtaLabel:   v.CtaLabel,
		CtaHref:    v.CtaHref,
		MediaKind:  v.MediaKind,
		MediaURL:   v.MediaUrl,
		MediaLabel: v.MediaLabel,
	}
}

func toDocumentSearchHitTypes(items []document.DocumentSearchHitView) []*DocumentSearchHitType {
	hits := make([]*DocumentSearchHitType, 0, len(items))
	for _, d := range items {
		hits = append(hits, &DocumentSearchHitType{
			ID:             d.Id,
			Kind:           d.Kind,
			Category:       d.Category,
			Slug:           d.Slug,
			Title:          d.Title,
			Snippet:        d.Snippet,
			QuestShortCode: d.QuestShortCode,
		})
	}
	return hits
}

func toSearchKindTypes(kinds []site.SearchKindView) []*SearchKindType {
	out := make([]*SearchKindType, len(kinds))
	for i, kind := range kinds {
		out[i] = &SearchKindType{
			Key:             kind.Key,
			Label:           kind.Label,
			Searchable:      kind.Searchable,
			ExclusionReason: kind.ExclusionReason,
		}
	}
	return out
}

func toAnnouncementRoleFields(in AnnouncementRoleInput) site.AnnouncementRoleFields {
	return site.AnnouncementRoleFields{
		Enabled: in.Enabled,
		RoleId:  in.RoleID,
	}
}

func toQuestAnnouncementRoleSettingType(v site.QuestAnnouncementRoleSettingView) *QuestAnnouncementRoleSettingType {
	return &QuestAnnouncementRoleSettingType{
		Enabled: v.Enabled,
		RoleID:  v.RoleId,
	}
}

func toDeliveryReceipt(v quest.DeliveryReceipt) *DeliveryReceipt {
	return &DeliveryReceipt{
		JobID:           v.JobId,
		DesiredRevision: int(v.DesiredRevision),
		AppliedRevision: int(v.AppliedRevision),
		DeliveryStatus:  v.DeliveryStatus,
	}
}

func toUpdateDmProfileFields(in UpdateDmProfileInput) member.UpdateDmProfileFields {
	fields := member.UpdateDmProfileFields{
		Tagline:          in.Tagline,
		Philosophy:       in.Philosophy,
		HouseRules:       in.HouseRules,
		AcceptingPlayers: in.AcceptingPlayers,
	}
	if in.TableInfo != nil && string(in.TableInfo) != "null" {
		fields.TableInfo = &in.TableInfo
	}
	return fields
}

func toDmProfileView(v member.DmProfileView) *DmProfileType {
	return toDmProfileType(&v)
}

func optionalInt32(o gql.Omittable[*int]) product.Optional[int32] {
	if !o.IsSet() {
		return product.Optional[int32]{}
	}
	v := o.Value()
	if v == nil {
		return product.Optional[int32]{Set: true, Value: nil}
	}
	i := int32(*v)
	return product.Optional[int32]{Set: true, Value: &i}
}

func optionalFloat64(o gql.Omittable[*float64]) product.Optional[float64] {
	if !o.IsSet() {
		return product.Optional[float64]{}
	}
	return product.Optional[float64]{Set: true, Value: o.Value()}
}

func optionalTime(o gql.Omittable[*time.Time]) product.Optional[time.Time] {
	if !o.IsSet() {
		return product.Optional[time.Time]{}
	}
	return product.Optional[time.Time]{Set: true, Value: o.Value()}
}

func optionalStringSlice(o gql.Omittable[[]string]) product.Optional[[]string] {
	if !o.IsSet() {
		return product.Optional[[]string]{}
	}
	v := o.Value()
	if v == nil {
		return product.Optional[[]string]{Set: true}
	}
	return product.Optional[[]string]{Set: true, Value: &v}
}

func toCreateQuestFields(in CreateQuestInput) quest.CreateQuestFields {
	var apl *int32
	if in.Apl != nil {
		v := int32(*in.Apl)
		apl = &v
	}
	return quest.CreateQuestFields{
		Title:          in.Title,
		RegionIds:      in.RegionIds,
		ScheduledAt:    in.ScheduledAt,
		DurationHours:  in.DurationHours,
		BriefBody:      in.BriefBody,
		DmId:           in.DmID,
		Kinds:          in.Kinds,
		SlotsMax:       int32(in.SlotsMax),
		ArcId:          in.ArcID,
		Tags:           in.Tags,
		Genres:         in.Genres,
		Apl:            apl,
		SignupType:     in.SignupType,
		AdditionalInfo: in.AdditionalInfo,
		VoiceChannelId: in.VoiceChannelID,
	}
}

func toQuestEditFields(in QuestEditInput) quest.QuestEditFields {
	return quest.QuestEditFields{
		ExpectedUpdatedAt: in.ExpectedUpdatedAt,
		Title:             optionalString(in.Title),
		RegionIds:         optionalStringSlice(in.RegionIds),
		ScheduledAt:       optionalTime(in.ScheduledAt),
		DurationHours:     optionalFloat64(in.DurationHours),
		BriefBody:         optionalString(in.BriefBody),
		DmId:              optionalString(in.DmID),
		Kinds:             optionalStringSlice(in.Kinds),
		SlotsMax:          optionalInt32(in.SlotsMax),
		ArcId:             optionalString(in.ArcID),
		Tags:              optionalStringSlice(in.Tags),
		Genres:            optionalStringSlice(in.Genres),
		Apl:               optionalInt32(in.Apl),
		SignupType:        optionalString(in.SignupType),
		AdditionalInfo:    optionalString(in.AdditionalInfo),
		VoiceChannelId:    optionalString(in.VoiceChannelID),
	}
}

func toParticipationAttestations(entries []*ParticipationAttestationInput) []quest.ParticipationAttestationFields {
	out := make([]quest.ParticipationAttestationFields, 0, len(entries))
	for _, entry := range entries {
		if entry == nil {
			continue
		}
		out = append(out, quest.ParticipationAttestationFields{
			CharacterId: entry.CharacterID,
			Status:      entry.Status,
		})
	}
	return out
}

func toQuestPcxpAwards(entries []*QuestPcxpAwardInput) []quest.QuestPcxpAwardFields {
	out := make([]quest.QuestPcxpAwardFields, 0, len(entries))
	for _, entry := range entries {
		if entry == nil {
			continue
		}
		out = append(out, quest.QuestPcxpAwardFields{
			CharacterId: entry.CharacterID,
			Pcxp:        int32(entry.Pcxp),
			Note:        entry.Note,
		})
	}
	return out
}

func toCloseQuestFields(in CloseQuestInput) quest.CloseQuestFields {
	return quest.CloseQuestFields{
		Attendance: toParticipationAttestations(in.Attendance),
		Rewards:    toQuestPcxpAwards(in.Rewards),
	}
}

func toQuestSummaryFields(in QuestSummaryInput) quest.QuestSummaryFields {
	fm := in.Frontmatter
	if len(fm) == 0 {
		fm = json.RawMessage("{}")
	}
	var expectedRevision *int32
	if in.ExpectedRevision != nil {
		value := int32(*in.ExpectedRevision)
		expectedRevision = &value
	}
	return quest.QuestSummaryFields{
		DocumentId:       in.DocumentID,
		ExpectedRevision: expectedRevision,
		QuestIds:         in.QuestIds,
		CharacterId:      in.CharacterID,
		Title:            in.Title,
		Body:             in.Body,
		Visibility:       in.Visibility,
		Frontmatter:      fm,
	}
}

func toQuestPointcrawlLinkType(v quest.QuestHexView) *QuestPointcrawlLinkType {
	return &QuestPointcrawlLinkType{
		QuestID:          v.QuestId,
		PointcrawlNodeID: v.HexId,
		Role:             v.Role,
		Name:             v.Name,
	}
}

func toQuestHexFieldsFromPointcrawl(links []*QuestPointcrawlLinkInput) []quest.QuestHexFields {
	out := make([]quest.QuestHexFields, 0, len(links))
	for _, link := range links {
		if link == nil {
			continue
		}
		out = append(out, quest.QuestHexFields{
			HexId: link.PointcrawlNodeID,
			Role:  link.Role,
		})
	}
	return out
}

func toQuestParticipantTypes(items []quest.QuestParticipantView) []*QuestParticipantType {
	out := make([]*QuestParticipantType, len(items))
	for i, item := range items {
		out[i] = toQuestParticipantFromQuest(item)
	}
	return out
}

func toQuestPointcrawlLinkTypes(items []quest.QuestHexView) []*QuestPointcrawlLinkType {
	out := make([]*QuestPointcrawlLinkType, len(items))
	for i, item := range items {
		out[i] = toQuestPointcrawlLinkType(item)
	}
	return out
}

func toAdminHealthAlertTypes(items []site.AdminHealthAlertView) []*AdminHealthAlertType {
	out := make([]*AdminHealthAlertType, len(items))
	for i, item := range items {
		out[i] = &AdminHealthAlertType{
			Key:             item.Key,
			Label:           item.Label,
			Severity:        item.Severity,
			RemediationHref: item.RemediationHref,
			FirstSeenAt:     item.FirstSeenAt,
			LastSeenAt:      item.LastSeenAt,
		}
	}
	return out
}

func toChannelVoiceMinutesTypes(items []member.ChannelVoiceMinutesView) []*ChannelVoiceMinutesType {
	out := make([]*ChannelVoiceMinutesType, len(items))
	for i, item := range items {
		out[i] = &ChannelVoiceMinutesType{ChannelID: item.ChannelId, Minutes: item.Minutes}
	}
	return out
}

func toActivityEventTypes(items []member.ActivityEventView) []*ActivityEventType {
	out := make([]*ActivityEventType, len(items))
	for i, item := range items {
		out[i] = &ActivityEventType{
			Kind:       item.Kind,
			ChannelID:  item.ChannelId,
			OccurredAt: item.OccurredAt,
			Amount:     item.Amount,
		}
	}
	return out
}

func toWeekActivityTypes(items []member.WeekActivityView) []*WeekActivityType {
	out := make([]*WeekActivityType, len(items))
	for i, item := range items {
		out[i] = &WeekActivityType{
			PeriodStart:  item.PeriodStart,
			VoiceMinutes: item.VoiceMinutes,
			Messages:     item.Messages,
			Reactions:    item.Reactions,
		}
	}
	return out
}

func toQuestDiscordDeliveryType(v quest.QuestDiscordDeliveryView) *QuestDiscordDeliveryType {
	return &QuestDiscordDeliveryType{
		JobID:           v.JobId,
		DesiredRevision: int(v.DesiredRevision),
		AppliedRevision: int(v.AppliedRevision),
		OverallStatus:   v.OverallStatus,
		MessageState:    v.MessageState,
		ThreadState:     v.ThreadState,
		EventState:      v.EventState,
		NextRetryAt:     v.NextRetryAt,
		ErrorCode:       v.ErrorCode,
		ErrorMessage:    v.ErrorMessage,
	}
}

func toSummaryDerivedType(v document.SummaryDerivedView) *SummaryDerivedType {
	var authoring *SummaryAuthoringType
	if v.Authoring != nil {
		authoring = &SummaryAuthoringType{CharacterID: v.Authoring.CharacterId, Complete: v.Authoring.Complete, QuestIds: v.Authoring.QuestIds}
	}
	quests := make([]*SummaryQuestRefType, len(v.Quests))
	for i, item := range v.Quests {
		quests[i] = &SummaryQuestRefType{ID: item.Id, ShortCode: item.ShortCode, Title: item.Title}
	}
	regions := make([]*SummaryRegionType, len(v.Regions))
	for i, item := range v.Regions {
		regions[i] = &SummaryRegionType{ID: item.Id, Name: item.Name}
	}
	nodes := make([]*SummaryPointcrawlNodeType, len(v.Hexes))
	for i, item := range v.Hexes {
		nodes[i] = &SummaryPointcrawlNodeType{ID: item.Id, MapID: item.MapId, Name: item.Hexcode}
	}
	dms := make([]*SummaryDmType, len(v.Dms))
	for i, item := range v.Dms {
		dms[i] = &SummaryDmType{ID: item.Id, DisplayName: item.DisplayName}
	}
	players := make([]*SummaryPlayerType, len(v.Players))
	for i, item := range v.Players {
		players[i] = &SummaryPlayerType{
			CharacterID:        item.CharacterId,
			CharacterShortCode: item.CharacterShortCode,
			CharacterName:      item.CharacterName,
			MemberID:           item.MemberId,
			Manual:             item.Manual,
		}
	}
	var gameDay *int
	if v.GameDay != nil {
		d := int(*v.GameDay)
		gameDay = &d
	}
	return &SummaryDerivedType{
		Authoring:       authoring,
		Quests:          quests,
		Regions:         regions,
		PointcrawlNodes: nodes,
		Dms:             dms,
		Players:         players,
		OccurredAt:      v.OccurredAt,
		Arc:             v.Arc,
		GameDay:         gameDay,
		GameDate:        toGameDateType(v.GameDate),
	}
}

func toDiscordSettingsType(v site.DiscordSettingsView) *DiscordSettingsType {
	return &DiscordSettingsType{
		AnnounceChannelID: v.AnnounceChannelId,
		RoleID:            v.RoleId,
		VoiceChannels:     toDiscordVoiceChannelTypes(v.VoiceChannels),
	}
}

func toDiscordVoiceChannelTypes(in []site.DiscordVoiceChannelView) []*DiscordVoiceChannelType {
	out := make([]*DiscordVoiceChannelType, len(in))
	for i, channel := range in {
		out[i] = &DiscordVoiceChannelType{Name: channel.Name, ChannelID: channel.ChannelId}
	}
	return out
}

func toDiscordSettingsFields(in DiscordSettingsInput) site.DiscordSettingsFields {
	channels := make([]site.DiscordVoiceChannelFields, 0, len(in.VoiceChannels))
	for _, channel := range in.VoiceChannels {
		if channel == nil {
			continue
		}
		channels = append(channels, site.DiscordVoiceChannelFields{Name: channel.Name, ChannelId: channel.ChannelID})
	}
	return site.DiscordSettingsFields{AnnounceChannelId: in.AnnounceChannelID, RoleId: in.RoleID, VoiceChannels: channels}
}
