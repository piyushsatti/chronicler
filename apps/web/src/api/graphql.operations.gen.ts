/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type BackstoryInput = {
  cohort: string;
  lore: string;
  name: string;
  retired: boolean;
  sourceRegionId?: string | null | undefined;
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
};

export type Density =
  | 'COMFORTABLE'
  | 'COMPACT';

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

export type RegionInput = {
  charterDeadline?: string | null | undefined;
  documentId?: string | null | undefined;
  kind: string;
  name: string;
};

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

export type AdminBackstoriesQueryVariables = Exact<{
  limit?: number;
  offset?: number;
  includeRetired?: boolean;
}>;


export type AdminBackstoriesQuery = { backstories: { total: number, items: Array<{ id: string, name: string, lore: string, cohort: string, sourceRegionId: string | null, retired: boolean }> } };

export type AdminCharactersQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type AdminCharactersQuery = { adminCharacterDirectory: { total: number, items: Array<{ id: string, shortCode: string, name: string, ownerHandle: string, status: string, verificationStatus: string }> } };

export type AdminCreationCatalogQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type AdminCreationCatalogQuery = { creationCatalog: { total: number, items: Array<{ id: string, kind: string, name: string, description: string | null, available: boolean, retired: boolean, introducedByRegionId: string | null }> } };

export type AdminGameCalendarQueryVariables = Exact<{
  realFrom: string;
  realTo: string;
}>;


export type AdminGameCalendarQuery = { gameCalendar: { definition: unknown, currentGameDay: number | null } };

export type AdminHomeBannerQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminHomeBannerQuery = { homeBanner: { enabled: boolean, title: string | null, body: string | null, ctaLabel: string | null, ctaHref: string | null, mediaKind: string | null, mediaUrl: string | null, mediaLabel: string | null } };

export type AdminMembersQueryVariables = Exact<{
  limit: number;
  search?: string | null | undefined;
}>;


export type AdminMembersQuery = { members: { total: number, items: Array<{ id: string, handle: string, displayName: string, roles: Array<string>, status: string, joinedAt: string }> } };

export type AdminOperationsQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type AdminOperationsQuery = { adminOperations: { activeAlertCount: number, pendingDeliveryCount: number, deliveryTotal: number, deliveries: Array<{ id: string }>, activeAlerts: Array<{ key: string, label: string, severity: string, remediationHref: string, firstSeenAt: string | null, lastSeenAt: string | null }> } };

export type AdminRegionsQueryVariables = Exact<{
  kind?: string | null | undefined;
  limit?: number;
  offset?: number;
}>;


export type AdminRegionsQuery = { regions: Array<{ id: string, name: string, kind: string, charterDeadline: string | null, createdAt: string }> };

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


export type CreateRegionMutation = { createRegion: { id: string, name: string, kind: string, charterDeadline: string | null, createdAt: string } };

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

export type PendingCharacterVerificationsQueryVariables = Exact<{
  limit?: number;
  offset?: number;
}>;


export type PendingCharacterVerificationsQuery = { pendingCharacterVerifications: { total: number, items: Array<{ id: string, shortCode: string, name: string, ownerHandle: string, ddbUrl: string | null, verificationSubmittedAt: string | null }> } };

export type PendingDmProfilesQueryVariables = Exact<{
  limit: number;
  offset?: number;
}>;


export type PendingDmProfilesQuery = { pendingDmProfileVerifications: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, dmProfileStatus: string | null, dmProfileReviewRevision: number | null }> } };

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

export type UpdateBackstoryMutationVariables = Exact<{
  id: string;
  input: BackstoryInput;
  meta: CommandMeta;
}>;


export type UpdateBackstoryMutation = { updateBackstory: { id: string, name: string, retired: boolean } };

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


export type UpdateRegionMutation = { updateRegion: { id: string, name: string, kind: string, charterDeadline: string | null, createdAt: string } };

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

export type BackstoriesQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type BackstoriesQuery = { backstories: { total: number, items: Array<{ id: string, name: string }> } };

export type CharacterQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type CharacterQuery = { character: { id: string, shortCode: string, name: string, status: string, ownerId: string, verificationStatus: CharacterReviewStatus, backstoryId: string | null, regionId: string | null, description: string | null, ddbUrl: string | null, displayIcon: string | null, updatedAt: string } | null };

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

export type MyCharacterListQueryVariables = Exact<{
  limit: number;
  offset: number;
}>;


export type MyCharacterListQuery = { myCharacters: { total: number, items: Array<{ id: string, shortCode: string, name: string, status: string, ownerId: string, verificationStatus: CharacterReviewStatus, backstoryId: string | null, regionId: string | null, description: string | null, ddbUrl: string | null, displayIcon: string | null }> } };

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


export type SyncCharacterDdbMutation = { syncCharacterDdb: { succeeded: boolean, attemptedAt: string } };

export type UpdateCharacterProfileMutationVariables = Exact<{
  characterId: string;
  input: UpdateCharacterProfileInput;
  meta: CommandMeta;
}>;


export type UpdateCharacterProfileMutation = { updateCharacterProfile: { id: string, description: string | null, updatedAt: string } };

export type ChronicleDetailQueryVariables = Exact<{
  slug: string;
}>;


export type ChronicleDetailQuery = { document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, author: { handle: string } | null } | null };

export type ChronicleListQueryVariables = Exact<{
  limit: number;
}>;


export type ChronicleListQuery = { documents: { total: number, items: Array<{ id: string, slug: string, category: string | null, title: string, frontmatter: unknown, updatedAt: string, author: { handle: string } | null, summaryDerived: { occurredAt: string | null, arc: string | null, gameDay: number | null, regions: Array<{ id: string, name: string }>, dms: Array<{ id: string, displayName: string }>, gameDate: { eraAbbrev: string, year: number, periodName: string, periodIndex: number, periodType: string, day: number } | null } | null }> } };

export type CodexDirectoryQueryVariables = Exact<{
  categoryPrefix?: string | null | undefined;
  search?: string | null | undefined;
}>;


export type CodexDirectoryQuery = { codexDirectory: { total: number, items: Array<{ id: string, slug: string, title: string, category: string | null }> } };

export type CodexEntryQueryVariables = Exact<{
  slug: string;
}>;


export type CodexEntryQuery = { codexEntry: { backlinkCount: number, document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, author: { handle: string } | null } } | null };

export type CommunityDirectoryQueryVariables = Exact<{
  limit: number;
}>;


export type CommunityDirectoryQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean, roles: Array<string> }> } };

export type DocumentQueryVariables = Exact<{
  slug: string;
}>;


export type DocumentQuery = { document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, author: { handle: string } | null } | null };

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

export type DiscordDeliveryModeQueryVariables = Exact<{ [key: string]: never; }>;


export type DiscordDeliveryModeQuery = { discordDeliveryMode: string };

export type EditPublishedDocumentMutationVariables = Exact<{
  id: string;
  input: DocumentEditInput;
  meta: CommandMeta;
}>;


export type EditPublishedDocumentMutation = { editPublishedDocument: { id: string, slug: string, version: number } };

export type EditorDocumentByIdQueryVariables = Exact<{
  id: string;
}>;


export type EditorDocumentByIdQuery = { documentById: { id: string, slug: string, kind: string, category: string | null, title: string, status: string, version: number, effectiveBody: string | null } | null };

export type EditorDocumentBySlugQueryVariables = Exact<{
  slug: string;
}>;


export type EditorDocumentBySlugQuery = { document: { id: string, slug: string, kind: string, category: string | null, title: string, status: string, version: number, effectiveBody: string | null } | null };

export type EditorQuestLoadQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type EditorQuestLoadQuery = { quest: { id: string, shortCode: string, scheduledAt: string, durationHours: number, slotsMax: number, kinds: Array<string>, genres: Array<string>, tags: Array<string>, apl: number | null, signupType: string | null, regions: Array<string>, updatedAt: string, briefDocument: { id: string, slug: string, title: string, status: string, version: number, effectiveBody: string | null } | null } | null };

export type EditorRegionsQueryVariables = Exact<{
  kind?: string | null | undefined;
}>;


export type EditorRegionsQuery = { regions: Array<{ id: string, name: string, kind: string }> };

export type EntityLinkCodexDirectoryQueryVariables = Exact<{ [key: string]: never; }>;


export type EntityLinkCodexDirectoryQuery = { codexDirectory: { items: Array<{ id: string, slug: string, title: string, category: string | null }> } };

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

export type SyncQuestDiscordMutationVariables = Exact<{
  questId: string;
  meta: CommandMeta;
}>;


export type SyncQuestDiscordMutation = { syncQuestDiscord: { jobId: string, desiredRevision: number, appliedRevision: number, deliveryStatus: string } };

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

export type HomeBannerQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeBannerQuery = { homeBanner: { enabled: boolean, title: string | null, body: string | null, ctaLabel: string | null, ctaHref: string | null, mediaKind: string | null, mediaUrl: string | null, mediaLabel: string | null } };

export type HomeBucketsQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeBucketsQuery = { home: { recentByCategory: Array<{ category: string | null, documents: Array<{ id: string, slug: string, title: string, category: string | null }> }> } };

export type HomeWarRoomQueryVariables = Exact<{
  upcomingFrom: string;
  upcomingTo: string;
  closedSince: string;
}>;


export type HomeWarRoomQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, recentlyClosedQuests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean }> }, regions: Array<{ id: string, name: string }> };

export type SiteStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type SiteStatsQuery = { siteStats: { totalMembers: number } };

export type MapAtlasQueryVariables = Exact<{
  atlasCode: string;
}>;


export type MapAtlasQuery = { map: { id: string, name: string, atlasCode: string, family: string, mapKind: string, assetPath: string | null, regionId: string | null, createdAt: string } | null };

export type MemberMeQueryVariables = Exact<{ [key: string]: never; }>;


export type MemberMeQuery = { memberMe: { id: string, handle: string, displayName: string, roles: Array<string> } };

export type AcknowledgeSuppressedNotificationsMutationVariables = Exact<{
  limit?: number | null | undefined;
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


export type MyNotificationsQuery = { myNotifications: { hasMore: boolean, nextBefore: string | null, items: Array<{ id: string, kind: string, title: string | null, summary: string | null, label: string, readAt: string | null, subjectType: string, subjectCode: string | null, createdAt: string }> } };

export type MyUnreadNotificationCountQueryVariables = Exact<{ [key: string]: never; }>;


export type MyUnreadNotificationCountQuery = { myUnreadNotificationCount: number };

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


export type DmTableBySlugQuery = { document: { id: string, slug: string, title: string, status: string, kind: string, category: string | null, effectiveBody: string | null, frontmatter: unknown, author: { handle: string } | null } | null };

export type DmTableScheduleQueryVariables = Exact<{
  limit: number;
}>;


export type DmTableScheduleQuery = { questBoard: { items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { title: string } | null }> } };

export type MemberProfileQueryVariables = Exact<{
  handle: string;
}>;


export type MemberProfileQuery = { memberProfile: { member: { id: string, handle: string, displayName: string, avatarUrl: string | null, roles: Array<string>, status: string, joinedAt: string }, dmProfile: { memberId: string, tagline: string | null, philosophy: string | null, houseRules: string | null, acceptingPlayers: boolean, status: string, reviewRevision: number } | null, availability: Array<{ day: string, startTime: string, endTime: string, note: string | null }>, activitySummary: { voiceMinutes: number, messages: number, reactions: number } } | null };

export type ProfileCommunityDirectoryQueryVariables = Exact<{
  limit: number;
}>;


export type ProfileCommunityDirectoryQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean, roles: Array<string> }> } };

export type MyCharactersQueryVariables = Exact<{ [key: string]: never; }>;


export type MyCharactersQuery = { myCharacters: { total: number, items: Array<{ id: string, status: string }> } };

export type QuestBoardQueryVariables = Exact<{
  limit: number;
}>;


export type QuestBoardQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };

export type QuestBoardChromeQueryVariables = Exact<{ [key: string]: never; }>;


export type QuestBoardChromeQuery = { communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, acceptingPlayers: boolean | null, isDm: boolean }> } };

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


export type QuestQuery = { quest: { id: string, shortCode: string, status: string, scheduledAt: string, durationHours: number, slotsMax: number, filledCount: number, displayStatus: string | null, genres: Array<string>, tags: Array<string>, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null }, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, status: string }> } | null };

export type QuestListQueryVariables = Exact<{
  filters: QuestFiltersInput;
  limit: number;
  offset: number;
}>;


export type QuestListQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, tags: Array<string>, regions: Array<string>, dm: { handle: string, displayName: string, avatarUrl: string | null } | null, briefDocument: { id: string, slug: string, title: string, effectiveBody: string | null } | null, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, memberAvatarUrl: string | null, status: string }>, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };

export type QuestRegionsQueryVariables = Exact<{
  limit: number;
}>;


export type QuestRegionsQuery = { regions: Array<{ id: string, name: string }> };

export type SignupForQuestMutationVariables = Exact<{
  questId: string;
  characterId: string;
  meta: CommandMeta;
}>;


export type SignupForQuestMutation = { signupForQuest: { questId: string, characterId: string, status: string } };

export type QuestSummaryPageQueryVariables = Exact<{
  shortCode: string;
  search: string;
}>;


export type QuestSummaryPageQuery = { quest: { id: string, shortCode: string, status: string, scheduledAt: string, durationHours: number, slotsMax: number, filledCount: number, displayStatus: string | null, genres: Array<string>, tags: Array<string>, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null }, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, status: string }> } | null, documents: { total: number, items: Array<{ id: string, slug: string, title: string, category: string | null, effectiveBody: string | null }> } };

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


export type RuleDetailQuery = { document: { id: string, slug: string, kind: string, category: string | null, status: string, visibility: string, title: string, effectiveBody: string | null, author: { handle: string } | null } | null };

export type RulesListQueryVariables = Exact<{
  limit: number;
}>;


export type RulesListQuery = { documents: { total: number, items: Array<{ id: string, slug: string, kind: string, category: string | null, title: string, effectiveBody: string | null, author: { handle: string } | null }> } };

export type SearchQueryVariables = Exact<{
  query: string;
  kinds?: Array<string> | string | null | undefined;
  limit: number;
}>;


export type SearchQuery = { search: { query: string, documents: Array<{ id: string, kind: string, slug: string, title: string, snippet: string, questShortCode: string | null }>, members: Array<{ memberId: string, handle: string, displayName: string }> } };

export type SearchableKindsQueryVariables = Exact<{ [key: string]: never; }>;


export type SearchableKindsQuery = { searchableKinds: Array<{ key: string, label: string, searchable: boolean, exclusionReason: string | null }> };
