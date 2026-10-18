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

func intPtr(v int) *int       { return &v }
func strPtr(v string) *string { return &v }

func optionalID(id string) *string {
	if id == "" {
		return nil
	}
	return &id
}

func clockToProductTime(t time.Time) product.Time {
	return product.Time(t.Format("15:04:05"))
}

func toDocumentType(d document.Document, body string) *DocumentType {
	cat := d.Kind
	return &DocumentType{
		ID:            d.ID,
		Slug:          d.Slug,
		Kind:          d.Kind,
		Category:      &cat,
		Status:        string(d.Status),
		Visibility:    string(d.Visibility),
		Title:         d.Title,
		AuthorID:      d.AuthorID,
		Frontmatter:   json.RawMessage("{}"),
		UpdatedAt:     time.Now(),
		EffectiveBody: &body,
	}
}

func toQuestV2FiltersFields(filters *QuestV2FiltersInput) *quest.QuestV2FiltersFields {
	if filters == nil {
		return nil
	}
	return &quest.QuestV2FiltersFields{
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

func toQuestsSpec(filters *QuestV2FiltersInput, limit, offset int) quest.QuestsSpec {
	spec := quest.QuestsSpec{Limit: int32(limit), Offset: int32(offset)}
	spec.Filters = toQuestV2FiltersFields(filters)
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

func toQuestV2View(v quest.QuestView) *QuestV2Type {
	var apl *int
	if v.Apl != nil {
		i := int(*v.Apl)
		apl = &i
	}
	return &QuestV2Type{
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
		CreatedBy:        v.CreatedBy,
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
		DisplayStatus:    v.DisplayStatus,
		Regions:          v.Regions,
	}
}

func toQuestV2ListResult(v quest.QuestV2ListResult) *QuestV2ListResult {
	items := make([]*QuestV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestV2View(item)
	}
	return &QuestV2ListResult{Items: items, Total: int(v.Total)}
}

func toQuestArcV2View(v quest.QuestArcView) *QuestArcV2Type {
	return &QuestArcV2Type{
		ID:         v.Id,
		Name:       v.Name,
		CreatedBy:  v.CreatedBy,
		CreatedAt:  v.CreatedAt,
		QuestCount: int(v.QuestCount),
	}
}

func toQuestArcV2ListResult(v quest.QuestArcV2ListResult) *QuestArcV2ListResult {
	items := make([]*QuestArcV2Type, 0, len(v.Items))
	for _, item := range v.Items {
		items = append(items, toQuestArcV2View(item))
	}
	return &QuestArcV2ListResult{Items: items, Total: int(v.Total)}
}

func toQuestV2(q quest.LegacyQuestView) *QuestV2Type {
	status := string(q.Status)
	return &QuestV2Type{
		ID:            q.ID,
		ShortCode:     q.ShortCode,
		Kinds:         []string{"standard"},
		Status:        status,
		DmID:          q.DMID,
		ScheduledAt:   q.ScheduledAt,
		DurationHours: q.DurationHours,
		DisplayStatus: strPtr(q.DisplayStatus),
		SlotsMax:      q.SlotsMax,
		FilledCount:   q.FilledCount,
		DocumentID:    optionalID(q.DocumentID),
		Tags:          []string{},
		Genres:        []string{},
		CreatedBy:     q.DMID,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		DiscordDelivery: &QuestDiscordDeliveryV2Type{
			DesiredRevision: q.DiscordDesiredRevision,
			AppliedRevision: q.DiscordAppliedRevision,
			OverallStatus:   "pending",
		},
	}
}

func toMemberType(m member.Member) *MemberType {
	return &MemberType{
		ID:          m.ID,
		Handle:      m.Handle,
		DisplayName: m.DisplayName,
		Status:      string(m.Status),
		Roles:       m.Roles,
		JoinedAt:    time.Now(),
	}
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

func toDmProfileV2Type(v *member.DmProfileView) *DmProfileV2Type {
	if v == nil {
		return nil
	}
	var tableInfo json.RawMessage
	if v.TableInfo != nil {
		tableInfo = *v.TableInfo
	}
	return &DmProfileV2Type{
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
		DmProfile:       toDmProfileV2Type(v.DmProfile),
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

func toMyPersonalizationType(v member.MyPersonalizationView) *MyPersonalizationType {
	out := &MyPersonalizationType{}
	if v.Settings != nil {
		out.Settings = toMemberSettingsType(*v.Settings)
	}
	return out
}

func toQuestParticipantV2FromQuest(v quest.QuestParticipantView) *QuestParticipantV2Type {
	return &QuestParticipantV2Type{
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
	}
}

func toQuestStateCountsFilters(filters *QuestStateCountsFiltersV2Input) *quest.QuestStateCountsFiltersV2Fields {
	if filters == nil {
		return nil
	}
	return &quest.QuestStateCountsFiltersV2Fields{
		Kind:     filters.Kind,
		DmId:     filters.DmID,
		RegionId: filters.RegionID,
		ArcId:    filters.ArcID,
		Tag:      filters.Tag,
	}
}

func toQuestStateCountsSpec(filters *QuestStateCountsFiltersV2Input) quest.QuestStateCountsSpec {
	spec := quest.QuestStateCountsSpec{Filters: toQuestStateCountsFilters(filters)}
	if filters != nil && filters.Tag != nil && *filters.Tag != "" {
		spec.TagFilterSet = true
		spec.TagVariants = []string{*filters.Tag}
	}
	return spec
}

func toQuestStateCountV2Types(items []quest.QuestStateCountView) []*QuestStateCountV2Type {
	out := make([]*QuestStateCountV2Type, len(items))
	for i, item := range items {
		out[i] = &QuestStateCountV2Type{State: item.State, Count: int(item.Count)}
	}
	return out
}

func toOpenQuestSeatV2Type(v quest.OpenQuestSeatView) *OpenQuestSeatV2Type {
	return &OpenQuestSeatV2Type{
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

func toOpenQuestSeatsV2Result(v quest.OpenQuestSeatsV2Result) *OpenQuestSeatsV2Result {
	entries := make([]*OpenQuestSeatV2Type, len(v.Entries))
	for i, e := range v.Entries {
		entries[i] = toOpenQuestSeatV2Type(e)
	}
	return &OpenQuestSeatsV2Result{Entries: entries, Total: int(v.Total)}
}

func toQuestParticipationPage(v quest.ParticipationPage) *ParticipationPage {
	items := make([]*QuestParticipantV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestParticipantV2FromQuest(item)
	}
	return &ParticipationPage{Items: items, Total: int(v.Total)}
}

func toDmSummaryFilters(filters *DmSummaryFiltersV2Input) *quest.DmSummaryFiltersV2Fields {
	if filters == nil {
		return nil
	}
	return &quest.DmSummaryFiltersV2Fields{
		QuestId: filters.QuestID,
		Search:  filters.Search,
	}
}

func toQuestSummariesV2Result(v quest.QuestSummariesV2Result) *QuestSummariesV2Result {
	summaries := make([]*DocumentType, len(v.Summaries))
	for i, item := range v.Summaries {
		summaries[i] = toDocumentViewType(item)
	}
	var totalPcxp *int
	if v.Totals.TotalPcxpAwarded != nil {
		awarded := int(*v.Totals.TotalPcxpAwarded)
		totalPcxp = &awarded
	}
	return &QuestSummariesV2Result{
		Summaries: summaries,
		Totals: &QuestSummaryTotalsV2Type{
			TotalPcxpAwarded: totalPcxp,
			Coverage:         RewardCoverage(v.Totals.Coverage),
		},
	}
}

func toDmLastSessionV2Type(v *quest.DmLastSessionView) *DmLastSessionV2Type {
	if v == nil {
		return nil
	}
	out := &DmLastSessionV2Type{Quest: toQuestV2View(v.Quest)}
	if v.RecapDocument != nil {
		out.RecapDocument = toDocumentViewType(*v.RecapDocument)
	}
	return out
}

func toDmStatsV2Type(v *quest.DmStatsView) *DmStatsV2Type {
	if v == nil {
		return nil
	}
	return &DmStatsV2Type{
		SessionCount: int(v.SessionCount),
		LastSession:  toDmLastSessionV2Type(v.LastSession),
	}
}

func toDmSessionHistoryV2Result(v quest.DmSessionHistoryV2Result) *DmSessionHistoryV2Result {
	items := make([]*DmLastSessionV2Type, len(v.Items))
	for i := range v.Items {
		items[i] = toDmLastSessionV2Type(&v.Items[i])
	}
	return &DmSessionHistoryV2Result{Items: items, Total: int(v.Total)}
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

func toCharacterV2Filters(filters *CharacterV2FiltersInput) *character.CharacterV2FiltersFields {
	if filters == nil {
		return nil
	}
	return &character.CharacterV2FiltersFields{
		OwnerId:    filters.OwnerID,
		GuildId:    filters.GuildID,
		RegionId:   filters.RegionID,
		NamePrefix: filters.NamePrefix,
		Status:     filters.Status,
	}
}

func toCharacterV2View(v character.CharacterView) *CharacterV2Type {
	return &CharacterV2Type{
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
		CreatedAt:               v.CreatedAt,
		UpdatedAt:               v.UpdatedAt,
		VerificationSubmittedAt: v.VerificationSubmittedAt,
		VerificationStatus:      CharacterReviewStatus(v.VerificationStatus),
		DisplayIcon:             v.DisplayIcon,
		DaysActive:              int(v.DaysActive),
	}
}

func toCharacterV2ListResult(v character.CharacterV2ListResult) *CharacterV2ListResult {
	items := make([]*CharacterV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCharacterV2View(item)
	}
	return &CharacterV2ListResult{Items: items, Total: int(v.Total)}
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

func toCoPlayerV2Type(v character.CoPlayerView) *CoPlayerV2Type {
	return &CoPlayerV2Type{
		CharacterID: v.CharacterId,
		MemberID:    v.MemberId,
		QuestCount:  int(v.QuestCount),
	}
}

func toCoPlayerPage(v character.CoPlayerPage) *CoPlayerPage {
	items := make([]*CoPlayerV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toCoPlayerV2Type(item)
	}
	return &CoPlayerPage{Items: items, Total: int(v.Total)}
}

func toQuestParticipantV2Type(v character.ParticipationView) *QuestParticipantV2Type {
	return &QuestParticipantV2Type{
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
	items := make([]*QuestParticipantV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toQuestParticipantV2Type(item)
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
		ID:            v.Id,
		Version:       int(v.Version),
		Slug:          v.Slug,
		Kind:          v.Kind,
		Category:      v.Category,
		Status:        v.Status,
		Visibility:    v.Visibility,
		Policy:        v.Policy,
		Title:         v.Title,
		Frontmatter:   fm,
		AuthorID:      v.AuthorId,
		UpdatedAt:     v.UpdatedAt,
		DeletedAt:     v.DeletedAt,
		DeletedBy:     v.DeletedBy,
		EffectiveBody: v.EffectiveBody,
		PublishedAt:   v.PublishedAt,
	}
}

func toDocumentListResult(v document.DocumentListResult) *DocumentListResult {
	items := make([]*DocumentType, len(v.Items))
	for i, item := range v.Items {
		items[i] = toDocumentViewType(item)
	}
	return &DocumentListResult{Items: items, Total: int(v.Total)}
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

func toAdminCharacterDirectoryEntryV2Type(v character.AdminCharacterDirectoryEntryView) *AdminCharacterDirectoryEntryV2Type {
	return &AdminCharacterDirectoryEntryV2Type{
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
		UpdatedAt:               v.UpdatedAt,
	}
}

func toAdminCharacterDirectoryV2Type(v character.AdminCharacterDirectoryView) *AdminCharacterDirectoryV2Type {
	items := make([]*AdminCharacterDirectoryEntryV2Type, len(v.Items))
	for i, item := range v.Items {
		items[i] = toAdminCharacterDirectoryEntryV2Type(item)
	}
	return &AdminCharacterDirectoryV2Type{Items: items, Total: int(v.Total)}
}

func toCharacterV2(c character.LegacyCharacterView) *CharacterV2Type {
	now := time.Now()
	return &CharacterV2Type{
		ID:                      c.ID,
		ShortCode:               c.ShortCode,
		Name:                    c.Name,
		OwnerID:                 c.OwnerID,
		Status:                  c.Status,
		RegionID:                nil,
		BackstoryID:             nil,
		Pcxp:                    c.PCXP,
		CreatedAt:               now,
		UpdatedAt:               now,
		VerificationSubmittedAt: &now,
	}
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

func toSiteStatsV2View(v site.SiteStatsView) *SiteStatsV2Type {
	return &SiteStatsV2Type{
		TotalMembers:                 int(v.TotalMembers),
		MembersByRole:                toCountByKeyTypes(v.MembersByRole),
		ActiveCharacters:             int(v.ActiveCharacters),
		PublishedDocumentsByKind:     toCountByKeyTypes(v.PublishedDocumentsByKind),
		PublishedDocumentsByCategory: toCountByKeyTypes(v.PublishedDocumentsByCategory),
		TotalMaps:                    int(v.TotalMaps),
		TotalRegions:                 int(v.TotalRegions),
		TotalQuests:                  int(v.TotalQuests),
		TotalDms:                     int(v.TotalDms),
		Activity:                     toActivitySummaryType(v.Activity),
	}
}

func toSiteStatsV2FromSnapshot(snapshot site.CommunityStatsSnapshot) *SiteStatsV2Type {
	return toSiteStatsV2View(site.SiteStatsView{
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

func toHomeV2View(v site.HomeView) *HomeV2Type {
	buckets := make([]*HomeBucketType, len(v.RecentByCategory))
	for i, bucket := range v.RecentByCategory {
		docs := make([]*DocumentType, len(bucket.Documents))
		for j, doc := range bucket.Documents {
			docs[j] = &DocumentType{
				ID:    doc.Id,
				Slug:  doc.Slug,
				Kind:  doc.Kind,
				Title: doc.Title,
			}
		}
		buckets[i] = &HomeBucketType{Category: bucket.Category, Documents: docs}
	}
	return &HomeV2Type{
		RecentByCategory: buckets,
		CommunityStats:   toSiteStatsV2View(v.CommunityStats),
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

func toHome(stats site.Stats) *HomeV2Type {
	return &HomeV2Type{
		RecentByCategory: []*HomeBucketType{},
		CommunityStats: &SiteStatsV2Type{
			TotalMembers: stats.TotalMembers,
		},
	}
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

func toMapV2(m spatial.LegacyMapView) *MapV2Type {
	var regionID *string
	if m.RegionID != "" {
		regionID = &m.RegionID
	}
	return &MapV2Type{
		ID:        m.ID,
		Name:      m.Name,
		AtlasCode: m.AtlasCode,
		Family:    m.Family,
		MapKind:   "",
		RegionID:  regionID,
		CreatedAt: time.Now(),
	}
}
