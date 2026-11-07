/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type AvailabilitySlotInput = {
  day: string;
  endTime: string;
  note?: string | null | undefined;
  startTime: string;
};

export type BackstoryFiltersInput = {
  cohort?: string | null | undefined;
  includeRetired?: boolean;
  regionId?: string | null | undefined;
};

export type BackstoryInput = {
  cohort: string;
  lore: string;
  name: string;
  retired: boolean;
  sourceRegionId?: string | null | undefined;
};

/**
 * Why an audited body span matters: DM and MEMBER spans are hidden from other
 * readers, MALFORMED spans from everyone; SPOILER spans are visible but blurred;
 * LOOKALIKE spans are visible text whose callout looks like a marker but is not.
 * LIST_NESTED is a diagnostic: a marker does not protect the whole list item.
 */
export type BodySpanKind =
  | 'DM'
  | 'LIST_NESTED'
  | 'LOOKALIKE'
  | 'MALFORMED'
  | 'MEMBER'
  | 'SPOILER';

export type CharacterFiltersInput = {
  guildId?: string | null | undefined;
  namePrefix?: string | null | undefined;
  ownerId?: string | null | undefined;
  regionId?: string | null | undefined;
  status?: string | null | undefined;
};

export type CharacterReviewStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'UNKNOWN';

export type CloseQuestInput = {
  attendance: Array<ParticipationAttestationInput>;
  rewards: Array<QuestPcxpAwardInput>;
};

export type ColorMode =
  | 'DARK'
  | 'LIGHT'
  | 'SYSTEM';

export type CommandMeta = {
  idempotencyKey: string;
};

export type CommunityDirectoryFiltersInput = {
  acceptingPlayers?: boolean | null | undefined;
  dmProfileStatus?: string | null | undefined;
  role?: string | null | undefined;
  search?: string | null | undefined;
};

export type CreateCharacterInput = {
  backgroundText?: string | null | undefined;
  backstoryId?: string | null | undefined;
  catalogPickIds?: Array<string>;
  /** Required on create (D4): a https://www.dndbeyond.com/characters/<id> sheet URL. */
  ddbUrl?: string | null | undefined;
  description?: string | null | undefined;
  guildId?: string | null | undefined;
  /** Optional https URL, at most 2048 characters. */
  imageUrl?: string | null | undefined;
  name: string;
  regionId?: string | null | undefined;
  shortCode?: string | null | undefined;
};

export type CreateQuestInput = {
  additionalInfo?: string | null | undefined;
  apl?: number | null | undefined;
  arcId?: string | null | undefined;
  briefBody?: string;
  dmId?: string | null | undefined;
  durationHours: number;
  genres?: Array<string>;
  kinds?: Array<string>;
  regionIds: Array<string>;
  scheduledAt: string;
  signupType?: string | null | undefined;
  slotsMax?: number;
  tags?: Array<string>;
  title: string;
  voiceChannelId?: string | null | undefined;
};

export type CreationCatalogFiltersInput = {
  includeAll?: boolean;
  kind?: string | null | undefined;
  regionId?: string | null | undefined;
};

export type Density =
  | 'COMFORTABLE'
  | 'COMPACT';

export type DiscordSettingsInput = {
  announceChannelId?: string | null | undefined;
  roleId?: string | null | undefined;
  voiceChannels: Array<DiscordVoiceChannelInput>;
};

export type DiscordVoiceChannelInput = {
  channelId: string;
  name: string;
};

export type DocumentAudienceInput = {
  policy?: Array<string> | null | undefined;
  readerIds?: Array<string>;
  visibility: string;
};

export type DocumentDraftInput = {
  body: string;
  category?: string | null | undefined;
  frontmatter: unknown;
  kind: string;
  policy?: Array<string> | null | undefined;
  title: string;
  visibility: string;
};

export type DocumentEditInput = {
  body?: string | null | undefined;
  category?: string | null | undefined;
  expectedRevision: number;
  frontmatter?: unknown;
  title?: string | null | undefined;
};

export type DowntimeInput = {
  goal?: string | null | undefined;
  id?: string | null | undefined;
  name: string;
  notes?: string | null | undefined;
  progress: number;
  status: string;
  target?: number | null | undefined;
};

export type HomeBannerInput = {
  body?: string | null | undefined;
  ctaHref?: string | null | undefined;
  ctaLabel?: string | null | undefined;
  enabled: boolean;
  mediaKind?: string | null | undefined;
  mediaLabel?: string | null | undefined;
  mediaUrl?: string | null | undefined;
  title?: string | null | undefined;
};

export type MapCreateInput = {
  assetPath?: string | null | undefined;
  atlasCode: string;
  family: string;
  grid?: string;
  mapKind: string;
  name: string;
  regionId?: string | null | undefined;
};

export type MapUpdateInput = {
  assetPath?: string | null | undefined;
  family: string;
  grid: string;
  name: string;
};

export type MemberRoleBatchInput = {
  memberId: string;
  note?: string | null | undefined;
  roles: Array<string>;
};

export type MemberSettingsPatch = {
  colorblindSafe?: boolean | null | undefined;
  density?: Density | null | undefined;
  effectsEnabled?: boolean | null | undefined;
  mode?: ColorMode | null | undefined;
  notifyCharacterVerification?: boolean | null | undefined;
  notifyDmMentioned?: boolean | null | undefined;
  notifyDocumentActivity?: boolean | null | undefined;
  notifyQuestScheduled?: boolean | null | undefined;
  notifyQuestSignup?: boolean | null | undefined;
  reducedMotion?: boolean | null | undefined;
  theme?: Theme | null | undefined;
  timezone?: string | null | undefined;
};

export type ParticipationAttestationInput = {
  characterId: string;
  status: string;
};

export type PointcrawlEdgeInput = {
  directed: boolean;
  documentId?: string | null | undefined;
  id?: string | null | undefined;
  kind: string;
  label?: string | null | undefined;
  nodeA: string;
  nodeB: string;
};

export type PointcrawlNodeInput = {
  id?: string | null | undefined;
  name: string;
  submapId?: string | null | undefined;
  x: number;
  y: number;
};

/** Admin-set exploration label on a hex. Display only: it does not change who can see or reach the hex. */
export type PointcrawlNodeState =
  | 'LOCKED'
  | 'MAPPED'
  | 'UNLOCKED';

export type PreviewAudience =
  | 'DM'
  | 'PLAYER';

export type QuestEditInput = {
  additionalInfo?: string | null | undefined;
  apl?: number | null | undefined;
  arcId?: string | null | undefined;
  briefBody?: string | null | undefined;
  dmId?: string | null | undefined;
  durationHours?: number | null | undefined;
  expectedUpdatedAt: string;
  genres?: Array<string> | null | undefined;
  kinds?: Array<string> | null | undefined;
  regionIds?: Array<string> | null | undefined;
  scheduledAt?: string | null | undefined;
  signupType?: string | null | undefined;
  slotsMax?: number | null | undefined;
  tags?: Array<string> | null | undefined;
  title?: string | null | undefined;
  voiceChannelId?: string | null | undefined;
};

export type QuestFiltersInput = {
  arcId?: string | null | undefined;
  displayStatus?: string | null | undefined;
  dmId?: string | null | undefined;
  genre?: string | null | undefined;
  kind?: string | null | undefined;
  regionId?: string | null | undefined;
  scheduledFrom?: string | null | undefined;
  scheduledTo?: string | null | undefined;
  search?: string | null | undefined;
  shortCodes?: Array<string> | null | undefined;
  status?: string | null | undefined;
  tag?: string | null | undefined;
};

export type QuestPcxpAwardInput = {
  characterId: string;
  note?: string | null | undefined;
  pcxp: number;
};

export type QuestPointcrawlLinkInput = {
  pointcrawlNodeId: string;
  role: string;
};

export type QuestSummaryInput = {
  body: string;
  characterId?: string | null | undefined;
  documentId?: string | null | undefined;
  expectedRevision?: number | null | undefined;
  frontmatter: unknown;
  questIds: Array<string>;
  title: string;
  visibility: string;
};

export type RegionInput = {
  charterDeadline?: string | null | undefined;
  documentId?: string | null | undefined;
  kind: string;
  name: string;
};

export type RewardCoverage =
  | 'COMPLETE'
  | 'LEGACY_UNKNOWN';

export type Theme =
  | 'DRACULA'
  | 'EMBER'
  | 'MIDNIGHT'
  | 'PARCHMENT'
  | 'VEGAN';

export type TimeAnchorInput = {
  epochDay: number;
  note?: string | null | undefined;
  rate: number;
  realUtc: string;
};

export type UpdateCharacterProfileInput = {
  backgroundText?: string | null | undefined;
  description?: string | null | undefined;
  /** Omit to keep, null to clear, or an https URL of at most 2048 characters. */
  imageUrl?: string | null | undefined;
};

export type UpdateDmProfileInput = {
  acceptingPlayers: boolean;
  houseRules?: string | null | undefined;
  philosophy?: string | null | undefined;
  tableInfo?: unknown;
  tagline?: string | null | undefined;
};

export type UpdateMyProfileInput = {
  avatarUrl?: string | null | undefined;
  displayName: string;
};

export type UpsertCreationCatalogEntryInput = {
  available?: boolean;
  description?: string | null | undefined;
  introducedByRegionId?: string | null | undefined;
  kind: string;
  name: string;
  optionId?: string | null | undefined;
  retired?: boolean;
};

export type VerificationVerdict =
  | 'APPROVED'
  | 'REJECTED';

export type QuestArcsPageQueryVariables = Exact<{
  offset: number;
}>;


export type QuestArcsPageQuery = { questArcs: { total: number, items: Array<{ id: string, name: string, createdBy: string, questCount: number }> } };

export type CurrentAdminAccessQueryVariables = Exact<{ [key: string]: never; }>;


export type CurrentAdminAccessQuery = { adminOperations: { activeAlertCount: number } };

export type CurrentReviewAccessQueryVariables = Exact<{ [key: string]: never; }>;


export type CurrentReviewAccessQuery = { pendingDmProfileVerifications: { total: number } };

export type AdminBackstoriesQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  includeRetired?: boolean;
  cohort?: string | null | undefined;
  regionId?: string | null | undefined;
}>;


export type AdminBackstoriesQuery = { backstories: { total: number, items: Array<{ id: string, name: string, lore: string, cohort: string, sourceRegionId: string | null, retired: boolean }> } };

export type AdminCharactersQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  namePrefix?: string | null | undefined;
  status?: string | null | undefined;
  regionId?: string | null | undefined;
}>;


export type AdminCharactersQuery = { adminCharacterDirectory: { total: number, items: Array<{ id: string, shortCode: string, name: string, ownerHandle: string, ownerDisplayName: string, status: string, verificationStatus: string }> } };

export type AdminCommunityStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminCommunityStatsQuery = { adminCommunityStats: { totalCharacters: number, charactersByClass: Array<{ key: string, count: number }>, questHexes: Array<{ id: string, name: string, mapName: string, questCount: number }> } };

export type AdminCreationCatalogQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  kind?: string | null | undefined;
  regionId?: string | null | undefined;
}>;


export type AdminCreationCatalogQuery = { creationCatalog: { total: number, items: Array<{ id: string, kind: string, name: string, description: string | null, available: boolean, retired: boolean, introducedByRegionId: string | null }> } };

export type AdminDiscordSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminDiscordSettingsQuery = { discordSettings: { announceChannelId: string | null, roleId: string | null, voiceChannels: Array<{ name: string, channelId: string }> } };

export type AdminGameCalendarQueryVariables = Exact<{
  realFrom: string;
  realTo: string;
}>;


export type AdminGameCalendarQuery = { gameCalendar: { definition: unknown, currentGameDay: number | null } };

export type AdminHomeBannerQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminHomeBannerQuery = { homeBanner: { enabled: boolean, title: string | null, body: string | null, ctaLabel: string | null, ctaHref: string | null, mediaKind: string | null, mediaUrl: string | null, mediaLabel: string | null } };

export type AdminMembersQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  search?: string | null | undefined;
  role?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type AdminMembersQuery = { members: { total: number, items: Array<{ id: string, handle: string, displayName: string, roles: Array<string>, status: string, joinedAt: string }> } };

export type AdminOperationsQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  alertsLimit?: number;
  alertsOffset?: number;
}>;


export type AdminOperationsQuery = { adminOperations: { activeAlertCount: number, pendingDeliveryCount: number, terminalDeliveryCount: number, deliveryTotal: number, config: { publicOrigin: string, publicOriginHealthy: boolean | null, deliveryMode: string, announcementRoleId: string | null, announcementRoleSource: string, announcementRoleHealthy: boolean | null }, scheduledWork: Array<{ kind: string, expectedSlot: string, outcome: string, lastStartedAt: string | null, lastFinishedAt: string | null, jobId: string | null, safeErrorCode: string | null }>, deliveries: Array<{ id: string, questId: string | null, questShortCode: string | null, questTitle: string | null, questLink: string | null, eventLink: string | null, messageId: string | null, state: string, desiredRevision: number | null, appliedRevision: number | null, failureStreak: number, maxAttempts: number, nextAttemptAt: string, safeError: string | null, redriveCount: number, createdAt: string, updatedAt: string }>, activeAlerts: Array<{ key: string, label: string, severity: string, remediationHref: string, firstSeenAt: string | null, lastSeenAt: string | null }> } };

export type AdminRegionsQueryVariables = Exact<{
  kind?: string | null | undefined;
  limit?: number;
  offset?: number;
}>;


export type AdminRegionsQuery = { regions: Array<{ id: string, name: string, kind: string, charterDeadline: string | null, documentId: string | null, createdAt: string }> };

export type AdminTimeAnchorsQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type AdminTimeAnchorsQuery = { timeAnchors: { total: number, items: Array<{ id: string, realUtc: string, epochDay: number, rate: number, note: string | null }> } };

export type ArchonAssignmentsQueryVariables = Exact<{
  regionId?: string | null | undefined;
  memberId?: string | null | undefined;
  limit?: number;
  offset?: number;
}>;


export type ArchonAssignmentsQuery = { archonAssignments: { total: number, items: Array<{ memberId: string, regionId: string, grantedAt: string }> } };

export type AssignArchonMutationVariables = Exact<{
  memberId: string;
  regionId: string;
  meta: CommandMeta;
}>;


export type AssignArchonMutation = { assignArchon: { memberId: string, regionId: string } };

export type CreateBackstoryMutationVariables = Exact<{
  input: BackstoryInput;
  meta: CommandMeta;
}>;


export type CreateBackstoryMutation = { createBackstory: { id: string, name: string } };

export type CreateRegionMutationVariables = Exact<{
  input: RegionInput;
  meta: CommandMeta;
}>;


export type CreateRegionMutation = { createRegion: { id: string, name: string, kind: string, charterDeadline: string | null, documentId: string | null, createdAt: string } };

export type CreateTimeAnchorMutationVariables = Exact<{
  input: TimeAnchorInput;
  meta: CommandMeta;
}>;


export type CreateTimeAnchorMutation = { createTimeAnchor: { id: string, realUtc: string, epochDay: number, rate: number, note: string | null } };

export type DecideDmProfileVerificationMutationVariables = Exact<{
  memberId: string;
  expectedRevision: number;
  verdict: VerificationVerdict;
  note?: string | null | undefined;
  meta: CommandMeta;
}>;


export type DecideDmProfileVerificationMutation = { decideDmProfileVerification: { memberId: string, status: string, reviewRevision: number } };

export type DecideVerificationMutationVariables = Exact<{
  characterId: string;
  expectedSubmittedAt: string;
  verdict: VerificationVerdict;
  note?: string | null | undefined;
  meta: CommandMeta;
}>;


export type DecideVerificationMutation = { decideVerification: { id: string, verdict: string, note: string | null } };

export type DmDashboardQueryVariables = Exact<{
  memberId: string;
  questLimit: number;
  questOffset: number;
  tableLimit: number;
  tableOffset: number;
}>;


export type DmDashboardQuery = { dmStats: { sessionCount: number } | null, questArcs: { total: number, items: Array<{ id: string, name: string, createdBy: string, questCount: number }> }, quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, briefDocument: { title: string } | null }> }, documents: { total: number, items: Array<{ id: string, slug: string, title: string, status: string, authorId: string, canEditMetadata: boolean, canEditBody: boolean }> } };

export type PendingCharacterVerificationsQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type PendingCharacterVerificationsQuery = { pendingCharacterVerifications: { total: number, items: Array<{ id: string, shortCode: string, name: string, ownerHandle: string, ownerDisplayName: string, ddbUrl: string | null, verificationSubmittedAt: string | null }> } };

export type PendingDmProfilesQueryVariables = Exact<{
  limit: number;
  offset?: number;
}>;


export type PendingDmProfilesQuery = { pendingDmProfileVerifications: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, dmProfileStatus: string | null, dmProfileReviewRevision: number | null }> } };

export type RedriveDiscordDeliveryMutationVariables = Exact<{
  jobId: string;
  reason: string;
  meta: CommandMeta;
}>;


export type RedriveDiscordDeliveryMutation = { redriveDiscordDelivery: { jobId: string, desiredRevision: number, appliedRevision: number, deliveryStatus: string } };

export type RevokeArchonMutationVariables = Exact<{
  memberId: string;
  regionId: string;
  meta: CommandMeta;
}>;


export type RevokeArchonMutation = { revokeArchon: { replayed: boolean } };

export type SetMemberRolesMutationVariables = Exact<{
  memberId: string;
  roles: Array<string> | string;
  note?: string | null | undefined;
  meta: CommandMeta;
}>;


export type SetMemberRolesMutation = { setMemberRoles: { id: string, roles: Array<string> } };

export type SetMemberRolesBatchMutationVariables = Exact<{
  changes: Array<MemberRoleBatchInput> | MemberRoleBatchInput;
  meta: CommandMeta;
}>;


export type SetMemberRolesBatchMutation = { setMemberRolesBatch: Array<{ memberId: string, ok: boolean, error: string | null }> };

export type TransitionRegionMutationVariables = Exact<{
  id: string;
  to: string;
  note: string;
  meta: CommandMeta;
}>;


export type TransitionRegionMutation = { transitionRegion: { id: string, name: string, kind: string, charterDeadline: string | null, documentId: string | null, createdAt: string } };

export type UpdateBackstoryMutationVariables = Exact<{
  id: string;
  input: BackstoryInput;
  meta: CommandMeta;
}>;


export type UpdateBackstoryMutation = { updateBackstory: { id: string, name: string, retired: boolean } };

export type UpdateDiscordSettingsMutationVariables = Exact<{
  input: DiscordSettingsInput;
  meta: CommandMeta;
}>;


export type UpdateDiscordSettingsMutation = { updateDiscordSettings: { announceChannelId: string | null, roleId: string | null, voiceChannels: Array<{ name: string, channelId: string }> } };

export type UpdateGameCalendarMutationVariables = Exact<{
  definition: unknown;
  meta: CommandMeta;
}>;


export type UpdateGameCalendarMutation = { updateGameCalendar: { definition: unknown } };

export type UpdateHomeBannerMutationVariables = Exact<{
  input: HomeBannerInput;
  meta: CommandMeta;
}>;


export type UpdateHomeBannerMutation = { updateHomeBanner: { enabled: boolean, title: string | null, body: string | null, ctaLabel: string | null, ctaHref: string | null, mediaKind: string | null, mediaUrl: string | null, mediaLabel: string | null } };

export type UpdateRegionMutationVariables = Exact<{
  id: string;
  input: RegionInput;
  meta: CommandMeta;
}>;


export type UpdateRegionMutation = { updateRegion: { id: string, name: string, kind: string, charterDeadline: string | null, documentId: string | null, createdAt: string } };

export type UpdateTimeAnchorMutationVariables = Exact<{
  id: string;
  input: TimeAnchorInput;
  meta: CommandMeta;
}>;


export type UpdateTimeAnchorMutation = { updateTimeAnchor: { id: string, realUtc: string, epochDay: number, rate: number, note: string | null } };

export type UpsertCreationCatalogEntryMutationVariables = Exact<{
  input: UpsertCreationCatalogEntryInput;
  meta: CommandMeta;
}>;


export type UpsertCreationCatalogEntryMutation = { upsertCreationCatalogEntry: { id: string, kind: string, name: string } };

export type AdjustPcxpMutationVariables = Exact<{
  characterId: string;
  amount: number;
  note: string;
  meta: CommandMeta;
}>;


export type AdjustPcxpMutation = { adjustPcxp: { id: string, amount: number | null } };

export type BackstoriesQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type BackstoriesQuery = { backstories: { total: number, items: Array<{ id: string, name: string }> } };

export type CharacterQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type CharacterQuery = { character: { id: string, shortCode: string, name: string, status: string, ownerId: string, verificationStatus: CharacterReviewStatus, backstoryId: string | null, regionId: string | null, description: string | null, ddbUrl: string | null, imageUrl: string | null, displayIcon: string | null, updatedAt: string, pcxp: number, daysActive: number, verificationSubmittedAt: string | null, ddbMirror: { level: number | null, xp: number | null, classes: string | null, species: string | null, background: string | null, syncedAt: string | null } | null } | null };

export type CharacterActivityQueryVariables = Exact<{
  characterId: string;
  limit: number;
  offset: number;
}>;


export type CharacterActivityQuery = { characterLogs: { total: number, items: Array<{ id: string, body: string, createdAt: string }> }, downtimeProjects: { total: number, items: Array<{ id: string, name: string, goal: string | null, progress: number, target: number | null, status: string, notes: string | null, updatedAt: string }> } };

export type CharacterBackstoryQueryVariables = Exact<{
  filters?: BackstoryFiltersInput | null | undefined;
  limit: number;
  offset: number;
}>;


export type CharacterBackstoryQuery = { backstories: { total: number, items: Array<{ id: string, name: string, lore: string }> } };

export type CharacterCreationCatalogQueryVariables = Exact<{
  filters?: CreationCatalogFiltersInput | null | undefined;
  limit: number;
  offset: number;
}>;


export type CharacterCreationCatalogQuery = { creationCatalog: { total: number, items: Array<{ id: string, kind: string, name: string, available: boolean, retired: boolean }> } };

export type CharacterDirectoryQueryVariables = Exact<{
  filters?: CharacterFiltersInput | null | undefined;
  limit: number;
  offset: number;
}>;


export type CharacterDirectoryQuery = { characters: { total: number, items: Array<{ id: string, shortCode: string, name: string, status: string, ownerId: string, verificationStatus: CharacterReviewStatus, backstoryId: string | null, regionId: string | null, description: string | null, ddbUrl: string | null, imageUrl: string | null, displayIcon: string | null, updatedAt: string, pcxp: number, verificationSubmittedAt: string | null, ddbMirror: { level: number | null, xp: number | null, classes: string | null, species: string | null, background: string | null, syncedAt: string | null } | null }> } };

export type CharacterHistoryQuestQueryVariables = Exact<{
  id: string;
}>;


export type CharacterHistoryQuestQuery = { quest: { id: string, shortCode: string, scheduledAt: string, briefDocument: { title: string } | null } | null };

export type CharacterOwnerQueryVariables = Exact<{
  id: string;
}>;


export type CharacterOwnerQuery = { member: { id: string, handle: string, displayName: string, avatarUrl: string | null } | null };

export type CharacterProgressionQueryVariables = Exact<{
  characterId: string;
  limit: number;
  offset: number;
}>;


export type CharacterProgressionQuery = { characterProgression: { total: number, items: Array<{ id: string, amount: number | null, note: string | null, recordedAt: string }> } };

export type CharacterRegionsQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type CharacterRegionsQuery = { regions: Array<{ id: string, name: string }> };

export type CharacterSummariesQueryVariables = Exact<{
  characterId: string;
  limit: number;
  offset: number;
}>;


export type CharacterSummariesQuery = { characterSummaries: { total: number, items: Array<{ id: string, slug: string, title: string }> } };

export type CoPlayersQueryVariables = Exact<{
  characterId: string;
  limit: number;
  offset: number;
}>;


export type CoPlayersQuery = { coPlayers: { total: number, items: Array<{ characterId: string, memberId: string, questCount: number }> } };

export type CreateCharacterMutationVariables = Exact<{
  input: CreateCharacterInput;
  meta: CommandMeta;
}>;


export type CreateCharacterMutation = { createCharacter: { id: string, shortCode: string } };

export type LogCharacterEventMutationVariables = Exact<{
  characterId: string;
  body: string;
  meta: CommandMeta;
}>;


export type LogCharacterEventMutation = { logCharacterEvent: { id: string, body: string } };

export type ParticipationsByCharacterQueryVariables = Exact<{
  characterId: string;
  limit: number;
  offset: number;
}>;


export type ParticipationsByCharacterQuery = { participationsByCharacter: { total: number, items: Array<{ questId: string, status: string, characterName: string, createdAt: string }> } };

export type RetireCharacterMutationVariables = Exact<{
  characterId: string;
  expectedUpdatedAt: string;
  meta: CommandMeta;
}>;


export type RetireCharacterMutation = { retireCharacter: { id: string, status: string, updatedAt: string } };

export type SubmitForVerificationMutationVariables = Exact<{
  characterId: string;
  expectedUpdatedAt: string;
  meta: CommandMeta;
}>;


export type SubmitForVerificationMutation = { submitForVerification: { id: string, verificationStatus: CharacterReviewStatus, updatedAt: string } };

export type SyncCharacterDdbMutationVariables = Exact<{
  characterId: string;
  ddbUrl: string;
  meta: CommandMeta;
}>;


export type SyncCharacterDdbMutation = { syncCharacterDdb: { succeeded: boolean, safeError: string | null, attemptedAt: string } };

export type UpdateCharacterProfileMutationVariables = Exact<{
  characterId: string;
  input: UpdateCharacterProfileInput;
  meta: CommandMeta;
}>;


export type UpdateCharacterProfileMutation = { updateCharacterProfile: { id: string, description: string | null, imageUrl: string | null, updatedAt: string } };

export type UpsertDowntimeProjectMutationVariables = Exact<{
  characterId: string;
  input: DowntimeInput;
  meta: CommandMeta;
}>;


export type UpsertDowntimeProjectMutation = { upsertDowntimeProject: { id: string, name: string, progress: number, status: string } };

export type ChronicleAuthorNameQueryVariables = Exact<{
  handle: string;
}>;


export type ChronicleAuthorNameQuery = { memberProfile: { member: { handle: string, displayName: string } } | null };

export type ChronicleDetailQueryVariables = Exact<{
  slug: string;
  id: string;
  byId: boolean;
}>;


export type ChronicleDetailQuery = { bySlug?: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, canEditBody: boolean, canEditMetadata: boolean, updatedAt: string, publishedAt: string | null, author: { handle: string } | null, summaryDerived: { occurredAt: string | null, arc: string | null, gameDay: number | null, quests: Array<{ id: string, shortCode: string, title: string | null }>, regions: Array<{ id: string, name: string }>, dms: Array<{ id: string, displayName: string }>, players: Array<{ characterId: string, characterShortCode: string, characterName: string, memberId: string, manual: boolean }>, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null } | null } | null, byId?: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, canEditBody: boolean, canEditMetadata: boolean, updatedAt: string, publishedAt: string | null, author: { handle: string } | null, summaryDerived: { occurredAt: string | null, arc: string | null, gameDay: number | null, quests: Array<{ id: string, shortCode: string, title: string | null }>, regions: Array<{ id: string, name: string }>, dms: Array<{ id: string, displayName: string }>, players: Array<{ characterId: string, characterShortCode: string, characterName: string, memberId: string, manual: boolean }>, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null } | null } | null };

export type ChronicleReaderDocumentFragment = { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, canEditBody: boolean, canEditMetadata: boolean, updatedAt: string, publishedAt: string | null, author: { handle: string } | null, summaryDerived: { occurredAt: string | null, arc: string | null, gameDay: number | null, quests: Array<{ id: string, shortCode: string, title: string | null }>, regions: Array<{ id: string, name: string }>, dms: Array<{ id: string, displayName: string }>, players: Array<{ characterId: string, characterShortCode: string, characterName: string, memberId: string, manual: boolean }>, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null } | null };

export type ChronicleListQueryVariables = Exact<{
  limit: number;
  offset: number;
  realFrom: string;
  realTo: string;
}>;


export type ChronicleListQuery = { gameCalendar: { definition: unknown }, documents: { total: number, items: Array<{ id: string, slug: string, category: string | null, visibility: string, title: string, effectiveBody: string | null, frontmatter: unknown, updatedAt: string, publishedAt: string | null, author: { handle: string } | null, summaryDerived: { occurredAt: string | null, arc: string | null, gameDay: number | null, regions: Array<{ id: string, name: string }>, dms: Array<{ id: string, displayName: string }>, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null } | null }> } };

export type CodexBacklinkDocumentQueryVariables = Exact<{
  id: string;
}>;


export type CodexBacklinkDocumentQuery = { documentById: { id: string, slug: string, kind: string, category: string | null, title: string } | null };

export type CodexDirectoryQueryVariables = Exact<{
  categoryPrefix?: string | null | undefined;
  search?: string | null | undefined;
  limit: number;
  offset: number;
}>;


export type CodexDirectoryQuery = { codexCategories: Array<{ category: string, count: number }>, codexDirectory: { total: number, items: Array<{ id: string, slug: string, title: string, category: string | null, effectiveBody: string | null }> } };

export type CodexEntryQueryVariables = Exact<{
  slug: string;
}>;


export type CodexEntryQuery = { codexEntry: { backlinkCount: number, document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, updatedAt: string, canEditBody: boolean, canEditMetadata: boolean, author: { handle: string } | null } } | null, documentBacklinks: Array<{ documentId: string, relation: string }> };

export type CodexEntryByIdQueryVariables = Exact<{
  id: string;
}>;


export type CodexEntryByIdQuery = { documentById: { id: string, slug: string, kind: string } | null };

export type CommunityCharactersQueryVariables = Exact<{
  limit: number;
}>;


export type CommunityCharactersQuery = { characters: { total: number, items: Array<{ id: string, shortCode: string, name: string, status: string, displayIcon: string | null, imageUrl: string | null, ownerId: string, regionId: string | null }> } };

export type CommunityDirectoryQueryVariables = Exact<{
  filters?: CommunityDirectoryFiltersInput | null | undefined;
  limit: number;
  offset?: number | null | undefined;
}>;


export type CommunityDirectoryQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean, roles: Array<string>, avatarUrl: string | null, availableDays: Array<string> }> } };

export type CommunityEntryQueryVariables = Exact<{
  slug: string;
}>;


export type CommunityEntryQuery = { document: { id: string, slug: string, kind: string, category: string | null, title: string, authorId: string, effectiveBody: string | null, publishedAt: string | null, updatedAt: string, author: { handle: string } | null } | null };

export type CommunityEntryRelatedQueryVariables = Exact<{
  authorId: string;
}>;


export type CommunityEntryRelatedQuery = { documents: { items: Array<{ id: string, slug: string, title: string, kind: string, category: string | null }> } };

export type CommunityHallOfFameQueryVariables = Exact<{
  slug: string;
}>;


export type CommunityHallOfFameQuery = { document: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null, canEditBody: boolean, canEditMetadata: boolean } | null };

export type CommunityRegionsQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type CommunityRegionsQuery = { regions: Array<{ id: string, name: string }> };

export type DocumentQueryVariables = Exact<{
  slug: string;
}>;


export type DocumentQuery = { document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, author: { handle: string } | null } | null };

export type AuditBodyQueryVariables = Exact<{
  body: string;
}>;


export type AuditBodyQuery = { auditBody: Array<{ startLine: number, endLine: number, kind: BodySpanKind, handle: string | null, suggestion: string | null, token: string | null, tokenLine: number | null, tokenColumn: number | null }> };

export type CreateDocumentMutationVariables = Exact<{
  input: DocumentDraftInput;
  meta: CommandMeta;
}>;


export type CreateDocumentMutation = { createDocument: { id: string, slug: string, version: number } };

export type CreateQuestMutationVariables = Exact<{
  input: CreateQuestInput;
  meta: CommandMeta;
}>;


export type CreateQuestMutation = { createQuest: { id: string, shortCode: string, updatedAt: string } };

export type EditPublishedDocumentMutationVariables = Exact<{
  id: string;
  input: DocumentEditInput;
  meta: CommandMeta;
}>;


export type EditPublishedDocumentMutation = { editPublishedDocument: { id: string, slug: string, version: number } };

export type EditorAudienceMutationVariables = Exact<{
  id: string;
  expectedRevision: number;
  input: DocumentAudienceInput;
  meta: CommandMeta;
}>;


export type EditorAudienceMutation = { setDocumentVisibility: { id: string, slug: string, version: number } };

export type EditorAudienceMemberQueryVariables = Exact<{
  id: string;
}>;


export type EditorAudienceMemberQuery = { member: { id: string, handle: string, displayName: string } | null };

export type EditorAudienceMembersQueryVariables = Exact<{
  search?: string | null | undefined;
  offset: number;
}>;


export type EditorAudienceMembersQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string }> } };

export type EditorDeleteMutationVariables = Exact<{
  id: string;
  expectedRevision: number;
  meta: CommandMeta;
}>;


export type EditorDeleteMutation = { deleteDocument: { replayed: boolean } };

export type EditorDocumentByIdQueryVariables = Exact<{
  id: string;
}>;


export type EditorDocumentByIdQuery = { documentById: { id: string, slug: string, kind: string, category: string | null, title: string, status: string, version: number, canEditMetadata: boolean, canEditBody: boolean, visibility: string, policy: Array<string> | null, readerIds: Array<string> | null, authorId: string, frontmatter: unknown, effectiveBody: string | null, summaryDerived: { authoring: { questIds: Array<string>, characterId: string | null, complete: boolean } | null, quests: Array<{ id: string, shortCode: string, title: string | null }> } | null } | null };

export type EditorDocumentBySlugQueryVariables = Exact<{
  slug: string;
}>;


export type EditorDocumentBySlugQuery = { document: { id: string, slug: string, kind: string, category: string | null, title: string, status: string, version: number, canEditMetadata: boolean, canEditBody: boolean, visibility: string, policy: Array<string> | null, readerIds: Array<string> | null, authorId: string, frontmatter: unknown, effectiveBody: string | null, summaryDerived: { authoring: { questIds: Array<string>, characterId: string | null, complete: boolean } | null, quests: Array<{ id: string, shortCode: string, title: string | null }> } | null } | null };

export type EditorGuideGroupsQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type EditorGuideGroupsQuery = { documents: { total: number, items: Array<{ category: string | null }> } };

export type EditorMapOptionsQueryVariables = Exact<{
  offset?: number;
}>;


export type EditorMapOptionsQuery = { maps: Array<{ id: string, atlasCode: string, name: string, canEdit: boolean }> };

export type EditorMapPlacesQueryVariables = Exact<{
  atlasCode: string;
  offset?: number;
}>;


export type EditorMapPlacesQuery = { map: { id: string, atlasCode: string, name: string, canEdit: boolean, pointcrawlNodes: Array<{ id: string, name: string }> } | null };

export type EditorQuestLoadQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type EditorQuestLoadQuery = { quest: { id: string, shortCode: string, scheduledAt: string, durationHours: number, slotsMax: number, kinds: Array<string>, genres: Array<string>, tags: Array<string>, apl: number | null, signupType: string | null, voiceChannelId: string | null, regions: Array<string>, updatedAt: string, arcId: string | null, arc: { id: string, name: string } | null, pointcrawlLinks: Array<{ pointcrawlNodeId: string, role: string }>, briefDocument: { id: string, slug: string, title: string, status: string, version: number, canEditMetadata: boolean, canEditBody: boolean, frontmatter: unknown, effectiveBody: string | null } | null } | null };

export type EditorRegionsQueryVariables = Exact<{
  kind?: string | null | undefined;
}>;


export type EditorRegionsQuery = { regions: Array<{ id: string, name: string, kind: string }> };

export type EditorRestoreMutationVariables = Exact<{
  id: string;
  meta: CommandMeta;
}>;


export type EditorRestoreMutation = { restoreDocument: { id: string, slug: string, version: number } };

export type EditorRevisionsQueryVariables = Exact<{
  documentId: string;
  limit: number;
  offset: number;
}>;


export type EditorRevisionsQuery = { documentRevisions: { total: number, items: Array<{ id: string, rev: number, title: string, body: string, reason: string, recordedAt: string }> } };

export type EditorSeriesOptionsQueryVariables = Exact<{
  offset?: number;
}>;


export type EditorSeriesOptionsQuery = { questArcs: { total: number, items: Array<{ id: string, name: string, createdBy: string }> } };

export type EditorSetQuestPlacesMutationVariables = Exact<{
  questId: string;
  links: Array<QuestPointcrawlLinkInput> | QuestPointcrawlLinkInput;
  meta: CommandMeta;
}>;


export type EditorSetQuestPlacesMutation = { setQuestPointcrawlLinks: Array<{ pointcrawlNodeId: string, role: string }> };

export type EditorSummaryCharactersQueryVariables = Exact<{
  offset: number;
}>;


export type EditorSummaryCharactersQuery = { myCharacters: { total: number, items: Array<{ id: string, shortCode: string, name: string }> } };

export type EditorSummaryQuestQueryVariables = Exact<{
  id: string;
}>;


export type EditorSummaryQuestQuery = { quest: { id: string, shortCode: string, briefDocument: { title: string } | null } | null };

export type EditorSummaryQuestsQueryVariables = Exact<{
  search?: string | null | undefined;
  offset: number;
}>;


export type EditorSummaryQuestsQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, briefDocument: { title: string } | null }> } };

export type EditorUnpublishMutationVariables = Exact<{
  id: string;
  expectedRevision: number;
  meta: CommandMeta;
}>;


export type EditorUnpublishMutation = { unpublishDocument: { id: string, slug: string, version: number } };

export type EditorUpsertQuestSummaryMutationVariables = Exact<{
  input: QuestSummaryInput;
  meta: CommandMeta;
}>;


export type EditorUpsertQuestSummaryMutation = { upsertQuestSummary: { id: string, slug: string, version: number } };

export type EditorVoiceChannelsQueryVariables = Exact<{ [key: string]: never; }>;


export type EditorVoiceChannelsQuery = { questVoiceChannels: Array<{ name: string, channelId: string }> };

export type EntityLinkCodexDirectoryQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type EntityLinkCodexDirectoryQuery = { codexDirectory: { total: number, items: Array<{ id: string, slug: string, title: string, category: string | null }> } };

export type EntityLinkQuestBoardQueryVariables = Exact<{
  limit: number;
}>;


export type EntityLinkQuestBoardQuery = { questBoard: { items: Array<{ id: string, shortCode: string, briefDocument: { title: string } | null }> } };

export type EntityLinkSearchQueryVariables = Exact<{
  query: string;
  limit: number;
}>;


export type EntityLinkSearchQuery = { search: { documents: Array<{ id: string, kind: string, slug: string, title: string, questShortCode: string | null }>, members: Array<{ memberId: string, handle: string, displayName: string }> } };

export type PreviewBodyQueryVariables = Exact<{
  body: string;
  audience: PreviewAudience;
  authorId?: string | null | undefined;
  memberHandle?: string | null | undefined;
}>;


export type PreviewBodyQuery = { previewBody: string };

export type PublishDocumentMutationVariables = Exact<{
  id: string;
  expectedRevision: number;
  meta: CommandMeta;
}>;


export type PublishDocumentMutation = { publishDocument: { id: string, slug: string, version: number } };

export type QuestGenreOptionsQueryVariables = Exact<{ [key: string]: never; }>;


export type QuestGenreOptionsQuery = { questGenreOptions: Array<string> };

export type UpdateDocumentMutationVariables = Exact<{
  id: string;
  input: DocumentEditInput;
  meta: CommandMeta;
}>;


export type UpdateDocumentMutation = { updateDocument: { id: string, slug: string, version: number } };

export type UpdateQuestMutationVariables = Exact<{
  id: string;
  input: QuestEditInput;
  meta: CommandMeta;
}>;


export type UpdateQuestMutation = { updateQuest: { id: string, shortCode: string, updatedAt: string } };

export type HomeAcceptingDmsQueryVariables = Exact<{
  offset: number;
}>;


export type HomeAcceptingDmsQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean }> } };

export type HomeBannerQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeBannerQuery = { homeBanner: { enabled: boolean, title: string | null, body: string | null, ctaLabel: string | null, ctaHref: string | null, mediaKind: string | null, mediaUrl: string | null, mediaLabel: string | null } };

export type HomeQuestParticipantsQueryVariables = Exact<{
  questId: string;
  offset: number;
}>;


export type HomeQuestParticipantsQuery = { quest: { participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }> } | null };

export type HomeRecentChroniclesQueryVariables = Exact<{
  limit: number;
}>;


export type HomeRecentChroniclesQuery = { documents: { items: Array<{ id: string, slug: string, title: string, visibility: string, publishedAt: string | null, author: { handle: string } | null, summaryDerived: { occurredAt: string | null } | null }> } };

export type HomeUpcomingQueryVariables = Exact<{
  upcomingFrom: string;
  upcomingTo: string;
  offset: number;
}>;


export type HomeUpcomingQuery = { quests: { total: number, items: Array<{ id: string, scheduledAt: string }> } };

export type HomeWarRoomQueryVariables = Exact<{
  upcomingFrom: string;
  upcomingTo: string;
  closedSince: string;
}>;


export type HomeWarRoomQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, recentlyClosedQuests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean }> }, regions: Array<{ id: string, name: string }> };

export type HomeWithdrawFromQuestMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type HomeWithdrawFromQuestMutation = { withdrawFromQuest: { questId: string, characterId: string, status: string } };

export type SiteStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type SiteStatsQuery = { siteStats: { totalQuests: number, activeCharacters: number } };

export type MapAtlasQueryVariables = Exact<{
  atlasCode: string;
  limit?: number;
  offset?: number;
}>;


export type MapAtlasQuery = { map: { id: string, canEdit: boolean, name: string, atlasCode: string, family: string, grid: string, mapKind: string, assetPath: string | null, regionId: string | null, createdAt: string, pointcrawlNodes: Array<{ id: string, mapId: string, x: number, y: number, name: string, state: PointcrawlNodeState, submapId: string | null, createdAt: string, linkedEntries: Array<{ mapId: string, nodeId: string, documentId: string, relation: string, createdAt: string, createdBy: string }> }>, pointcrawlEdges: Array<{ id: string, mapId: string, nodeA: string, nodeB: string, directed: boolean, kind: string, label: string | null, documentId: string | null }> } | null };

export type MapAssignmentsQueryVariables = Exact<{
  memberId?: string | null | undefined;
  regionId?: string | null | undefined;
  offset?: number;
}>;


export type MapAssignmentsQuery = { archonAssignments: { total: number, items: Array<{ memberId: string, regionId: string, grantedAt: string }> } };

export type MapContainmentQueryVariables = Exact<{
  atlasCode: string;
  limit?: number;
  offset?: number;
}>;


export type MapContainmentQuery = { map: { id: string, pointcrawlNodes: Array<{ submapId: string | null }> } | null };

export type MapCreateMutationVariables = Exact<{
  input: MapCreateInput;
  meta: CommandMeta;
}>;


export type MapCreateMutation = { createMap: { id: string, atlasCode: string } };

export type MapDirectoryQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type MapDirectoryQuery = { maps: Array<{ id: string, canEdit: boolean, name: string, atlasCode: string, family: string, grid: string, mapKind: string, assetPath: string | null, regionId: string | null, createdAt: string }>, regions: Array<{ canCreateMap: boolean, id: string, name: string, kind: string, charterDeadline: string | null, documentId: string | null, createdAt: string }> };

export type MapDocumentQueryVariables = Exact<{
  id: string;
}>;


export type MapDocumentQuery = { documentById: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null };

export type MapDocumentsQueryVariables = Exact<{
  id0: string;
  id1: string;
  id2: string;
  id3: string;
  id4: string;
}>;


export type MapDocumentsQuery = { document0: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null, document1: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null, document2: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null, document3: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null, document4: { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null } | null };

export type MapDocumentFieldsFragment = { id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null };

export type MapLinkEntryMutationVariables = Exact<{
  mapId: string;
  nodeId: string;
  documentId: string;
  relation: string;
  meta: CommandMeta;
}>;


export type MapLinkEntryMutation = { linkPointcrawlEntry: { documentId: string } };

export type MapLocationDocumentsQueryVariables = Exact<{
  search?: string | null | undefined;
  offset?: number;
}>;


export type MapLocationDocumentsQuery = { documents: { total: number, items: Array<{ id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null }> } };

export type MapNodeLinksQueryVariables = Exact<{
  atlasCode: string;
  nodeOffset: number;
  offset: number;
}>;


export type MapNodeLinksQuery = { map: { pointcrawlNodes: Array<{ id: string, linkedEntries: Array<{ mapId: string, nodeId: string, documentId: string, relation: string, createdAt: string, createdBy: string }> }> } | null };

export type MapQuestTitlesQueryVariables = Exact<{
  codes: Array<string> | string;
}>;


export type MapQuestTitlesQuery = { quests: { items: Array<{ shortCode: string, status: string, displayStatus: string | null, briefDocument: { title: string } | null }> } };

export type MapRegionActivityQueryVariables = Exact<{
  atlasCode: string;
}>;


export type MapRegionActivityQuery = { regionActivity: { regionId: string, regionName: string, fillingCount: number, scheduledCount: number, liveCount: number, openQuests: Array<{ shortCode: string, scheduledAt: string, slotsMax: number, filledCount: number }>, liveQuests: Array<{ shortCode: string, scheduledAt: string, slotsMax: number, filledCount: number }> } | null };

export type MapRegionCountsQueryVariables = Exact<{
  regionId: string;
}>;


export type MapRegionCountsQuery = { regionCounts: { regionId: string, questCount: number, pointcrawlNodeCount: number } | null };

export type MapSaveEdgeMutationVariables = Exact<{
  mapId: string;
  input: PointcrawlEdgeInput;
  meta: CommandMeta;
}>;


export type MapSaveEdgeMutation = { setPointcrawlEdge: { id: string } };

export type MapSaveNodeMutationVariables = Exact<{
  mapId: string;
  input: PointcrawlNodeInput;
  meta: CommandMeta;
}>;


export type MapSaveNodeMutation = { upsertPointcrawlNode: { id: string } };

export type MapSetNodeStateMutationVariables = Exact<{
  mapId: string;
  nodeId: string;
  state: PointcrawlNodeState;
  meta: CommandMeta;
}>;


export type MapSetNodeStateMutation = { setPointcrawlNodeState: { id: string, state: PointcrawlNodeState } };

export type MapUnlinkEntryMutationVariables = Exact<{
  mapId: string;
  nodeId: string;
  documentId: string;
  relation: string;
  meta: CommandMeta;
}>;


export type MapUnlinkEntryMutation = { unlinkPointcrawlEntry: { replayed: boolean } };

export type MapUpdateMutationVariables = Exact<{
  id: string;
  input: MapUpdateInput;
  meta: CommandMeta;
}>;


export type MapUpdateMutation = { updateMap: { id: string, atlasCode: string } };

export type MemberHubQueryVariables = Exact<{
  memberId: string;
}>;


export type MemberHubQuery = { member: { id: string, joinedAt: string, avatarUrl: string | null } | null, memberActivityStats: { questsPlayed: number, summariesAuthored: number, messages: number, voiceMinutes: number, longestSessionHours: number | null, recentSessions: Array<{ kind: string, occurredAt: string, amount: number }> } | null };

export type MemberMeQueryVariables = Exact<{ [key: string]: never; }>;


export type MemberMeQuery = { memberMe: { id: string, handle: string, displayName: string, roles: Array<string> } };

export type MemberMyPrivateNotesQueryVariables = Exact<{ [key: string]: never; }>;


export type MemberMyPrivateNotesQuery = { myPrivateNotes: { body: string, updatedAt: string | null } };

export type MemberRosterQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type MemberRosterQuery = { myCharacters: { total: number, items: Array<{ id: string, shortCode: string, name: string, status: string, imageUrl: string | null, ddbMirror: { classes: string | null, species: string | null } | null }> } };

export type MemberSetMyPrivateNotesMutationVariables = Exact<{
  body: string;
  meta: CommandMeta;
}>;


export type MemberSetMyPrivateNotesMutation = { setMyPrivateNotes: { body: string, updatedAt: string | null } };

export type MemberUpcomingQueryVariables = Exact<{
  from: string;
  limit?: number;
  offset?: number;
}>;


export type MemberUpcomingQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, briefDocument: { title: string } | null, participants: Array<{ memberId: string, characterName: string, status: string }> }> } };

export type AcknowledgeSuppressedNotificationsMutationVariables = Exact<{
  limit: number;
  meta: CommandMeta;
}>;


export type AcknowledgeSuppressedNotificationsMutation = { acknowledgeSuppressedNotifications: { replayed: boolean, affectedCount: number } };

export type MarkNotificationsReadMutationVariables = Exact<{
  ids: Array<string> | string;
  meta: CommandMeta;
}>;


export type MarkNotificationsReadMutation = { markNotificationsRead: { replayed: boolean, affectedCount: number } };

export type MyNotificationsQueryVariables = Exact<{
  limit: number;
  before?: string | null | undefined;
}>;


export type MyNotificationsQuery = { myNotifications: { hasMore: boolean, nextBefore: string | null, items: Array<{ id: string, kind: string, title: string | null, summary: string | null, label: string, readAt: string | null, subjectId: string, subjectType: string, subjectCode: string | null, createdAt: string }> } };

export type MyUnreadNotificationCountQueryVariables = Exact<{ [key: string]: never; }>;


export type MyUnreadNotificationCountQuery = { myUnreadNotificationCount: number };

export type RetainedCalendarQueryVariables = Exact<{
  realFrom: string;
  realTo: string;
  selectedDate: string;
}>;


export type RetainedCalendarQuery = { gameCalendar: { currentGameDay: number | null, currentGameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null, monthGrid: Array<{ realDate: string, gameDay: number | null, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null }> }, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null };

export type RetainedCalendarQuestsQueryVariables = Exact<{
  filters: QuestFiltersInput;
  offset: number;
}>;


export type RetainedCalendarQuestsQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, displayStatus: string | null, scheduledAt: string, slotsMax: number, filledCount: number, dm: { handle: string, displayName: string } | null, briefDocument: { title: string } | null }> } };

export type RetainedRealDatesQueryVariables = Exact<{
  gameDay: number;
  offset: number;
}>;


export type RetainedRealDatesQuery = { realDates: { items: Array<string>, total: number } };

export type RetainedDocumentByIdQueryVariables = Exact<{
  id: string;
}>;


export type RetainedDocumentByIdQuery = { documentById: { id: string, slug: string, kind: string, category: string | null, title: string } | null };

export type RetainedDocumentBySlugQueryVariables = Exact<{
  slug: string;
}>;


export type RetainedDocumentBySlugQuery = { document: { id: string, slug: string, kind: string, category: string | null, title: string } | null };

export type RetainedSeriesArcQueryVariables = Exact<{
  id: string;
  offset: number;
}>;


export type RetainedSeriesArcQuery = { questArc: { id: string, name: string, createdBy: string, createdAt: string, questCount: number, quests: Array<{ id: string, shortCode: string, status: string, displayStatus: string | null, scheduledAt: string, slotsMax: number, dm: { handle: string, displayName: string } | null, briefDocument: { title: string, effectiveBody: string | null } | null, participants: Array<{ characterId: string, characterName: string, memberAvatarUrl: string | null, status: string }> }> } | null };

export type RetainedSeriesAuthorityQueryVariables = Exact<{
  handle: string;
}>;


export type RetainedSeriesAuthorityQuery = { memberProfile: { member: { id: string, roles: Array<string>, status: string }, dmProfile: { status: string } | null } | null };

export type RetainedUpsertArcMutationVariables = Exact<{
  id?: string | null | undefined;
  name: string;
  meta: CommandMeta;
}>;


export type RetainedUpsertArcMutation = { upsertQuestArc: { id: string, name: string, createdBy: string, createdAt: string, questCount: number } };

export type MyPersonalizationQueryVariables = Exact<{ [key: string]: never; }>;


export type MyPersonalizationQuery = { myPersonalization: { settings: { memberId: string, theme: Theme, mode: ColorMode, effectsEnabled: boolean, colorblindSafe: boolean, reducedMotion: boolean, density: Density, timezone: string | null, updatedAt: string | null, notifyCharacterVerification: boolean, notifyQuestSignup: boolean, notifyDocumentActivity: boolean, notifyQuestScheduled: boolean, notifyDmMentioned: boolean } | null } | null };

export type UpdateMySettingsMutationVariables = Exact<{
  input: MemberSettingsPatch;
  meta: CommandMeta;
}>;


export type UpdateMySettingsMutation = { updateMySettings: { memberId: string, theme: Theme, mode: ColorMode, effectsEnabled: boolean, colorblindSafe: boolean, reducedMotion: boolean, density: Density, timezone: string | null, updatedAt: string | null, notifyCharacterVerification: boolean, notifyQuestSignup: boolean, notifyDocumentActivity: boolean, notifyQuestScheduled: boolean, notifyDmMentioned: boolean } };

export type DmTableBySlugQueryVariables = Exact<{
  slug: string;
}>;


export type DmTableBySlugQuery = { document: { id: string, slug: string, title: string, status: string, kind: string, category: string | null, effectiveBody: string | null, frontmatter: unknown, authorId: string, canEditBody: boolean, canEditMetadata: boolean, author: { handle: string } | null } | null };

export type DmTableScheduleQueryVariables = Exact<{
  memberId: string;
  limit: number;
  offset: number;
}>;


export type DmTableScheduleQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, briefDocument: { title: string } | null }> } };

export type MemberProfileQueryVariables = Exact<{
  handle: string;
}>;


export type MemberProfileQuery = { memberProfile: { member: { id: string, handle: string, displayName: string, avatarUrl: string | null, roles: Array<string>, status: string, joinedAt: string }, dmProfile: { memberId: string, tagline: string | null, philosophy: string | null, houseRules: string | null, tableInfo: unknown, acceptingPlayers: boolean, status: string, reviewRevision: number } | null, availability: Array<{ day: string, startTime: string, endTime: string, note: string | null }>, activitySummary: { voiceMinutes: number, messages: number, reactions: number } } | null };

export type ProfileActivityQueryVariables = Exact<{
  memberId: string;
  limit: number;
  offset: number;
}>;


export type ProfileActivityQuery = { memberActivityStats: { questsPlayed: number, summariesAuthored: number } | null, documents: { total: number, items: Array<{ id: string, slug: string, title: string, publishedAt: string | null }> } };

export type ProfileDmDetailsQueryVariables = Exact<{
  memberId: string;
  limit: number;
  offset: number;
}>;


export type ProfileDmDetailsQuery = { questArcs: { total: number, items: Array<{ id: string, name: string, createdBy: string, questCount: number }> }, dmStats: { sessionCount: number } | null, documents: { total: number, items: Array<{ id: string, slug: string, title: string, status: string, authorId: string, canEditBody: boolean, canEditMetadata: boolean }> } };

export type ProfileDmTierQueryVariables = Exact<{ [key: string]: never; }>;


export type ProfileDmTierQuery = { myUnlocks: { dmTier: string } };

export type ProfileSetMyAvailabilityMutationVariables = Exact<{
  slots: Array<AvailabilitySlotInput> | AvailabilitySlotInput;
  meta: CommandMeta;
}>;


export type ProfileSetMyAvailabilityMutation = { setMyAvailability: Array<{ day: string, startTime: string, endTime: string, note: string | null }> };

export type ProfileSubmitDmProfileMutationVariables = Exact<{
  expectedRevision: number;
  meta: CommandMeta;
}>;


export type ProfileSubmitDmProfileMutation = { submitDmProfileForVerification: { memberId: string, status: string, reviewRevision: number } };

export type ProfileUpdateMyDmProfileMutationVariables = Exact<{
  input: UpdateDmProfileInput;
  meta: CommandMeta;
}>;


export type ProfileUpdateMyDmProfileMutation = { updateMyDmProfile: { memberId: string, status: string, reviewRevision: number, tagline: string | null, philosophy: string | null, houseRules: string | null, acceptingPlayers: boolean } };

export type ProfileUpdateMyProfileMutationVariables = Exact<{
  input: UpdateMyProfileInput;
  meta: CommandMeta;
}>;


export type ProfileUpdateMyProfileMutation = { updateMyProfile: { id: string, displayName: string, avatarUrl: string | null } };

export type MyCharactersQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type MyCharactersQuery = { myCharacters: { total: number, items: Array<{ id: string, status: string, name: string, shortCode: string }> } };

export type QuestAddParticipantMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type QuestAddParticipantMutation = { addQuestParticipant: { characterId: string, status: string } };

export type QuestSetArcMutationVariables = Exact<{
  id: string;
  input: QuestEditInput;
  meta: CommandMeta;
}>;


export type QuestSetArcMutation = { updateQuest: { id: string, updatedAt: string, arcId: string | null } };

export type QuestAttestParticipationMutationVariables = Exact<{
  questId: string;
  entries: Array<ParticipationAttestationInput> | ParticipationAttestationInput;
  meta: CommandMeta;
}>;


export type QuestAttestParticipationMutation = { attestQuestParticipation: Array<{ characterId: string, status: string }> };

export type QuestAuthoringAuthorityQueryVariables = Exact<{
  handle: string;
}>;


export type QuestAuthoringAuthorityQuery = { memberProfile: { member: { id: string, roles: Array<string>, status: string }, dmProfile: { status: string } | null } | null };

export type QuestBoardQueryVariables = Exact<{
  limit: number;
}>;


export type QuestBoardQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };

export type QuestBoardChromeQueryVariables = Exact<{
  offset?: number;
}>;


export type QuestBoardChromeQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, acceptingPlayers: boolean | null, isDm: boolean }> } };

export type CloseQuestMutationVariables = Exact<{
  id: string;
  input: CloseQuestInput;
  meta: CommandMeta;
}>;


export type CloseQuestMutation = { closeQuest: { id: string, status: string } };

export type QuestQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type QuestQuery = { quest: { id: string, shortCode: string, status: string, dmId: string, updatedAt: string, arcId: string | null, scheduledAt: string, durationHours: number, slotsMax: number, kinds: Array<string>, signupType: string | null, filledCount: number, displayStatus: string | null, genres: Array<string>, tags: Array<string>, regions: Array<string>, arc: { id: string, name: string } | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null, frontmatter: unknown } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null }, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberDisplayName: string, status: string, lastPlayedAt: string | null }>, pointcrawlLinks: Array<{ pointcrawlNodeId: string, role: string, name: string }> } | null };

export type QuestListQueryVariables = Exact<{
  filters: QuestFiltersInput;
  limit: number;
  offset: number;
}>;


export type QuestListQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };

export type QuestMapOptionsQueryVariables = Exact<{
  offset?: number;
}>;


export type QuestMapOptionsQuery = { maps: Array<{ id: string, atlasCode: string, name: string, canEdit: boolean }> };

export type QuestNodeOptionsQueryVariables = Exact<{
  atlasCode: string;
  offset?: number;
}>;


export type QuestNodeOptionsQuery = { map: { id: string, atlasCode: string, name: string, canEdit: boolean, pointcrawlNodes: Array<{ id: string, name: string }> } | null };

export type QuestArcOptionsQueryVariables = Exact<{
  offset?: number;
}>;


export type QuestArcOptionsQuery = { questArcs: { total: number, items: Array<{ id: string, name: string }> } };

export type QuestParticipantsQueryVariables = Exact<{
  questId: string;
  offset?: number;
}>;


export type QuestParticipantsQuery = { quest: { participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberDisplayName: string, memberAvatarUrl: string | null, status: string, lastPlayedAt: string | null }> } | null };

export type QuestSetPointcrawlLinksMutationVariables = Exact<{
  questId: string;
  links: Array<QuestPointcrawlLinkInput> | QuestPointcrawlLinkInput;
  meta: CommandMeta;
}>;


export type QuestSetPointcrawlLinksMutation = { setQuestPointcrawlLinks: Array<{ pointcrawlNodeId: string, role: string }> };

export type PublishQuestPlayerListMutationVariables = Exact<{
  questId: string;
  meta: CommandMeta;
}>;


export type PublishQuestPlayerListMutation = { publishQuestPlayerList: { jobId: string, deliveryStatus: string } };

export type QuestRegionsQueryVariables = Exact<{
  limit: number;
}>;


export type QuestRegionsQuery = { regions: Array<{ id: string, name: string }> };

export type QuestRemoveParticipantMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type QuestRemoveParticipantMutation = { removeQuestParticipant: { characterId: string, status: string } };

export type QuestRosterCharactersQueryVariables = Exact<{
  namePrefix: string;
}>;


export type QuestRosterCharactersQuery = { characters: { items: Array<{ id: string, name: string, ownerId: string, status: string, shortCode: string }> } };

export type QuestSelectParticipantsMutationVariables = Exact<{
  questId: string;
  characterIds: Array<string> | string;
  fillByLastGamePlayed?: boolean;
  meta: CommandMeta;
}>;


export type QuestSelectParticipantsMutation = { selectQuestParticipants: Array<{ characterId: string, status: string }> };

export type SignupForQuestMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type SignupForQuestMutation = { signupForQuest: { questId: string, characterId: string, status: string } };

export type QuestSummaryPageQueryVariables = Exact<{
  questId: string;
  offset?: number;
}>;


export type QuestSummaryPageQuery = { questSummaries: { summaries: Array<{ id: string, slug: string, title: string, category: string | null, status: string, authorId: string, canEditBody: boolean, canEditMetadata: boolean, effectiveBody: string | null }>, totals: { totalPcxpAwarded: number | null, coverage: RewardCoverage } } };

export type TransitionQuestStatusMutationVariables = Exact<{
  id: string;
  to: string;
  meta: CommandMeta;
}>;


export type TransitionQuestStatusMutation = { transitionQuestStatus: { id: string, status: string } };

export type WithdrawFromQuestMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type WithdrawFromQuestMutation = { withdrawFromQuest: { questId: string, characterId: string, status: string } };

export type RuleDetailQueryVariables = Exact<{
  slug: string;
}>;


export type RuleDetailQuery = { document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, updatedAt: string, canEditBody: boolean, canEditMetadata: boolean, author: { handle: string } | null } | null, documentBacklinks: Array<{ documentId: string }> };

export type RulesListQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type RulesListQuery = { documents: { total: number, items: Array<{ id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null, author: { handle: string } | null }> } };

export type SearchQueryVariables = Exact<{
  query: string;
  kinds?: Array<string> | string | null | undefined;
  limit: number;
  offset: number;
}>;


export type SearchQuery = { search: { query: string, documentTotal: number, documentOrder: string, memberTotal: number, memberOrder: string, documents: Array<{ id: string, kind: string, category: string | null, slug: string, title: string, snippet: string, questShortCode: string | null }>, members: Array<{ memberId: string, handle: string, displayName: string, avatarUrl: string | null }> } };

export type SearchableKindsQueryVariables = Exact<{ [key: string]: never; }>;


export type SearchableKindsQuery = { searchableKinds: Array<{ key: string, label: string, searchable: boolean, exclusionReason: string | null }> };
