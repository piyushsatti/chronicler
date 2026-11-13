package graph

import "time"

// ListComplexity charges each paginated selection once, at the field owning its limit.
func ListComplexity() ComplexityRoot {
	var c ComplexityRoot
	queryListComplexity(&c)
	nestedListComplexity(&c)
	implicitListComplexity(&c)
	mutationListComplexity(&c)
	return c
}

func queryListComplexity(c *ComplexityRoot) {
	page := func(child, limit, _ int) int { return listCost(child, limit) }
	byID := func(child int, _ string, limit, _ int) int { return listCost(child, limit) }
	filtered := func(child int, _ *string, limit, _ int) int { return listCost(child, limit) }

	c.Query.AdminCharacterDirectory = func(child int, _ *AdminCharacterDirectoryFiltersInput, limit, _ int) int {
		return listCost(child, limit)
	}
	for _, field := range []*func(int, *string, int, int) int{
		&c.Query.AdminOperations,
		&c.Query.QuestBoard,
		&c.Query.Regions,
	} {
		*field = filtered
	}
	c.Query.ArchonAssignments = func(child int, _, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.Query.Backstories = func(child int, _ *BackstoryFiltersInput, limit, _ int) int { return listCost(child, limit) }
	for _, field := range []*func(int, string, int, int) int{
		&c.Query.CharacterLogs,
		&c.Query.CharacterProgression,
		&c.Query.CharacterSummaries,
		&c.Query.CharacterVerificationHistory,
		&c.Query.CoPlayers,
		&c.Query.DmSessionHistory,
		&c.Query.DocumentBacklinks,
		&c.Query.DocumentRevisions,
		&c.Query.DowntimeProjects,
		&c.Query.MemberRoleHistory,
		&c.Query.ParticipationsByCharacter,
		&c.Query.QuestSummaries,
	} {
		*field = byID
	}
	c.Query.Characters = func(child int, _ *CharacterFiltersInput, limit, _ int) int { return listCost(child, limit) }
	c.Query.CodexDirectory = func(child int, _, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.Query.CommunityDirectory = func(child int, _ *CommunityDirectoryFiltersInput, limit, _ int) int { return listCost(child, limit) }
	c.Query.CreationCatalog = func(child int, _ *CreationCatalogFiltersInput, limit, _ int) int { return listCost(child, limit) }
	c.Query.DmSummaries = func(child int, _ *DmSummaryFiltersInput, limit, _ int) int { return listCost(child, limit) }
	c.Query.Documents = func(child int, _ *DocumentFiltersInput, limit, _ int) int { return listCost(child, limit) }
	for _, field := range []*func(int, int, int) int{
		&c.Query.DocumentsTrash,
		&c.Query.MyCharacters,
		&c.Query.MyQuestSignups,
		&c.Query.MyUnlocks,
		&c.Query.PendingCharacterVerifications,
		&c.Query.PendingDmProfileVerifications,
		&c.Query.QuestArcs,
		&c.Query.TimeAnchors,
	} {
		*field = page
	}
	c.Query.LieutenantAssignments = func(child int, _, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.Query.Maps = func(child int, _, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.Query.Members = func(child int, _ *MemberFiltersInput, _ *MemberSortInput, limit, _ int) int {
		return listCost(child, limit)
	}
	c.Query.MyNotifications = func(child, limit int, _ bool, _ *string) int { return listCost(child, limit) }
	c.Query.OpenQuestSeats = func(child int, _, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.Query.Quests = func(child int, _ *QuestFiltersInput, limit, _ int) int { return listCost(child, limit) }
	c.Query.RealDates = func(child, _, limit, _ int) int { return listCost(child, limit) }
	c.Query.RecentlyClosedQuests = func(child int, _ *string, _ *time.Time, limit, _ int) int { return listCost(child, limit) }
	c.Query.Search = func(child int, _ string, _ []string, limit, _ int) int { return listCost(child, limit) }
	c.Query.UnlockablesCatalog = func(child int, _ bool, limit, _ int) int { return listCost(child, limit) }
}

func nestedListComplexity(c *ComplexityRoot) {
	page := func(child, limit, _ int) int { return listCost(child, limit) }
	filtered := func(child int, _ *string, limit, _ int) int { return listCost(child, limit) }
	c.AdminOperationsType.ActiveAlerts = page
	c.CodexEntryCardType.Subjects = page
	c.MapType.PointcrawlEdges = page
	c.MapType.PointcrawlNodes = page
	c.MemberActivityStatsType.RecentSessions = page
	c.MemberActivityStatsType.VoiceByChannel = page
	c.MemberProfileType.RecentWeeks = page
	c.PointcrawlNodeType.LinkedEntries = page
	c.QuestArcType.Quests = page
	c.QuestType.Participants = filtered
	c.QuestType.PointcrawlLinks = filtered
}

func implicitListComplexity(c *ComplexityRoot) {
	// Implicit-list estimates follow the product cardinalities contract.
	hundred := func(child int) int { return listCost(child, 100) }
	availability := func(child int) int { return listCost(child, 28) }
	c.AdminOperationsType.ScheduledWork = func(child int) int { return listCost(child, 2) }
	c.AdminCommunityStatsType.CharactersByClass = hundred
	c.AdminCommunityStatsType.QuestHexes = hundred
	c.CharacterType.Proficiencies = hundred
	c.DiscordSettingsType.VoiceChannels = hundred
	c.GameCalendarType.MonthGrid = func(child int) int { return listCost(child, 366) }
	c.HomeType.RecentByCategory = func(child int) int { return listCost(child, 6) }
	c.HomeBucketType.Documents = func(child int) int { return listCost(child, 5) }
	c.MemberProfileType.Availability = availability
	c.Query.CodexCategories = hundred
	c.Query.MemberAvailability = func(child int, _ string) int { return availability(child) }
	c.Query.MyAvailability = availability
	c.Query.QuestStateCounts = func(child int, _ *QuestStateCountsFiltersInput) int { return listCost(child, 5) }
	c.Query.QuestVoiceChannels = hundred
	c.Query.SearchableKinds = func(child int) int { return listCost(child, 20) }
	c.RegionActivityType.LiveQuests = hundred
	c.RegionActivityType.OpenQuests = hundred
	c.SiteStatsType.MembersByRole = func(child int) int { return listCost(child, 7) }
	c.SummaryDerivedType.Dms = hundred
	c.SummaryDerivedType.Players = hundred
	c.SummaryDerivedType.PointcrawlNodes = hundred
	c.SummaryDerivedType.Quests = hundred
	c.SummaryDerivedType.Regions = hundred
}

func mutationListComplexity(c *ComplexityRoot) {
	c.Mutation.AttestQuestParticipation = func(child int, _ string, entries []*ParticipationAttestationInput, _ CommandMeta) int {
		return listCost(child, len(entries))
	}
	c.Mutation.SelectQuestParticipants = func(child int, _ string, ids []string, fill bool, _ CommandMeta) int {
		n := len(ids)
		if fill {
			n = 100
		}
		return listCost(child, n)
	}
	c.Mutation.SetMemberRolesBatch = func(child int, changes []*MemberRoleBatchInput, _ CommandMeta) int {
		return listCost(child, len(changes))
	}
	c.Mutation.SetMyAvailability = func(child int, slots []*AvailabilitySlotInput, _ CommandMeta) int { return listCost(child, len(slots)) }
	c.Mutation.SetQuestPointcrawlLinks = func(child int, _ string, links []*QuestPointcrawlLinkInput, _ CommandMeta) int {
		return listCost(child, len(links))
	}
}

func listCost(child, limit int) int {
	// gqlgen falls back to unweighted cost when custom cost is smaller than child.
	limit = max(1, limit)
	maxInt := int(^uint(0) >> 1)
	if child > (maxInt-1)/limit {
		return maxInt
	}
	return 1 + limit*child
}
