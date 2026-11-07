export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Date: { input: string; output: string; }
  DateTime: { input: string; output: string; }
  JSON: { input: unknown; output: unknown; }
  Time: { input: string; output: string; }
};

export type ActivityEventType = {
  amount: Scalars['Float']['output'];
  channelId: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  occurredAt: Scalars['DateTime']['output'];
};

export type ActivitySummaryType = {
  messages: Scalars['Float']['output'];
  reactions: Scalars['Float']['output'];
  voiceMinutes: Scalars['Float']['output'];
};

export type AdminCharacterDirectoryEntryType = {
  /** Mirror time of the last successful D&D Beyond sync. Older than verificationSubmittedAt means that sync failed and the sheet is stale. */
  ddbSyncedAt?: Maybe<Scalars['DateTime']['output']>;
  ddbUrl?: Maybe<Scalars['String']['output']>;
  guildId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerAvatarUrl?: Maybe<Scalars['String']['output']>;
  ownerDisplayName: Scalars['String']['output'];
  ownerHandle: Scalars['String']['output'];
  ownerId: Scalars['ID']['output'];
  regionId?: Maybe<Scalars['ID']['output']>;
  regionName?: Maybe<Scalars['String']['output']>;
  shortCode: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  verificationStatus: Scalars['String']['output'];
  verificationSubmittedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type AdminCharacterDirectoryFiltersInput = {
  namePrefix?: InputMaybe<Scalars['String']['input']>;
  regionId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type AdminCharacterDirectoryType = {
  items: Array<AdminCharacterDirectoryEntryType>;
  total: Scalars['Int']['output'];
};

export type AdminCommunityStatsType = {
  /** Class catalog name. Empty when the character has no class pick. */
  charactersByClass: Array<CountByKeyType>;
  questHexes: Array<AdminQuestHexCountType>;
  totalCharacters: Scalars['Int']['output'];
};

export type AdminDeliveryConfigType = {
  announcementRoleHealthy?: Maybe<Scalars['Boolean']['output']>;
  announcementRoleId?: Maybe<Scalars['String']['output']>;
  announcementRoleSource: Scalars['String']['output'];
  deliveryMode: Scalars['String']['output'];
  publicOrigin: Scalars['String']['output'];
  publicOriginHealthy?: Maybe<Scalars['Boolean']['output']>;
};

export type AdminDeliveryJobType = {
  appliedRevision?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTime']['output'];
  desiredRevision?: Maybe<Scalars['Int']['output']>;
  eventLink?: Maybe<Scalars['String']['output']>;
  failureStreak: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  maxAttempts: Scalars['Int']['output'];
  messageId?: Maybe<Scalars['String']['output']>;
  nextAttemptAt: Scalars['DateTime']['output'];
  questId?: Maybe<Scalars['ID']['output']>;
  questLink?: Maybe<Scalars['String']['output']>;
  questShortCode?: Maybe<Scalars['String']['output']>;
  questTitle?: Maybe<Scalars['String']['output']>;
  redriveCount: Scalars['Int']['output'];
  safeError?: Maybe<Scalars['String']['output']>;
  state: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AdminHealthAlertType = {
  firstSeenAt?: Maybe<Scalars['DateTime']['output']>;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  lastSeenAt?: Maybe<Scalars['DateTime']['output']>;
  remediationHref: Scalars['String']['output'];
  severity: Scalars['String']['output'];
};

export type AdminOperationsType = {
  activeAlertCount: Scalars['Int']['output'];
  activeAlerts: Array<AdminHealthAlertType>;
  config: AdminDeliveryConfigType;
  deliveries: Array<AdminDeliveryJobType>;
  deliveryTotal: Scalars['Int']['output'];
  pendingDeliveryCount: Scalars['Int']['output'];
  scheduledWork: Array<ScheduledWorkStatusType>;
  terminalDeliveryCount: Scalars['Int']['output'];
};


export type AdminOperationsTypeActiveAlertsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type AdminQuestHexCountType = {
  id: Scalars['ID']['output'];
  mapName: Scalars['String']['output'];
  name: Scalars['String']['output'];
  questCount: Scalars['Int']['output'];
};

export type AnnouncementRoleInput = {
  enabled: Scalars['Boolean']['input'];
  roleId?: InputMaybe<Scalars['String']['input']>;
};

export type ArchonAssignmentType = {
  grantedAt: Scalars['DateTime']['output'];
  grantedBy?: Maybe<Scalars['ID']['output']>;
  memberId: Scalars['ID']['output'];
  regionId: Scalars['ID']['output'];
};

export type ArchonPage = {
  items: Array<ArchonAssignmentType>;
  total: Scalars['Int']['output'];
};

export type AvailabilitySlotInput = {
  day: Scalars['String']['input'];
  endTime: Scalars['Time']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  startTime: Scalars['Time']['input'];
};

export type AvailabilitySlotType = {
  day: Scalars['String']['output'];
  endTime: Scalars['Time']['output'];
  note?: Maybe<Scalars['String']['output']>;
  startTime: Scalars['Time']['output'];
};

export type BackstoryFiltersInput = {
  cohort?: InputMaybe<Scalars['String']['input']>;
  includeRetired?: Scalars['Boolean']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};

export type BackstoryInput = {
  cohort: Scalars['String']['input'];
  lore: Scalars['String']['input'];
  name: Scalars['String']['input'];
  retired: Scalars['Boolean']['input'];
  sourceRegionId?: InputMaybe<Scalars['ID']['input']>;
};

export type BackstoryPage = {
  items: Array<BackstoryType>;
  total: Scalars['Int']['output'];
};

export type BackstoryType = {
  cohort: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lore: Scalars['String']['output'];
  name: Scalars['String']['output'];
  retired: Scalars['Boolean']['output'];
  sourceRegionId?: Maybe<Scalars['ID']['output']>;
};

/**
 * One marked span of an unsaved body, from the server's own marker parser.
 * Lines are 1-based and inclusive. handle is the member a MEMBER span addresses;
 * suggestion is a best-effort corrected marker for MALFORMED and LOOKALIKE spans.
 * LIST_NESTED records locate accepted markers inside lists, separately from
 * projection spans; they have no token replacement suggestion.
 * token is the exact source text of the marker defining the span (the offending
 * token for MALFORMED and LOOKALIKE): `[!` through the first `]`, or, when
 * unclosed, `[!` and its first word only, so replacing it with suggestion keeps
 * the prose after it. tokenLine is 1-based; tokenColumn is 1-based and
 * counted in UTF-16 code units, so an editor can replace exactly that range with
 * suggestion without parsing marker grammar.
 */
export type BodySpanAudit = {
  endLine: Scalars['Int']['output'];
  handle?: Maybe<Scalars['String']['output']>;
  kind: BodySpanKind;
  startLine: Scalars['Int']['output'];
  suggestion?: Maybe<Scalars['String']['output']>;
  token?: Maybe<Scalars['String']['output']>;
  tokenColumn?: Maybe<Scalars['Int']['output']>;
  tokenLine?: Maybe<Scalars['Int']['output']>;
};

/**
 * Why an audited body span matters: DM and MEMBER spans are hidden from other
 * readers, MALFORMED spans from everyone; SPOILER spans are visible but blurred;
 * LOOKALIKE spans are visible text whose callout looks like a marker but is not.
 * LIST_NESTED is a diagnostic: a marker does not protect the whole list item.
 */
export enum BodySpanKind {
  Dm = 'DM',
  ListNested = 'LIST_NESTED',
  Lookalike = 'LOOKALIKE',
  Malformed = 'MALFORMED',
  Member = 'MEMBER',
  Spoiler = 'SPOILER'
}

export type CategoryCountType = {
  category: Scalars['String']['output'];
  count: Scalars['Int']['output'];
};

export type ChannelVoiceMinutesType = {
  channelId: Scalars['String']['output'];
  minutes: Scalars['Float']['output'];
};

export type CharacterDdbMirrorType = {
  armorClass?: Maybe<Scalars['Int']['output']>;
  background?: Maybe<Scalars['String']['output']>;
  characterId: Scalars['ID']['output'];
  classes?: Maybe<Scalars['String']['output']>;
  level?: Maybe<Scalars['Int']['output']>;
  maxHp?: Maybe<Scalars['Int']['output']>;
  species?: Maybe<Scalars['String']['output']>;
  syncedAt?: Maybe<Scalars['DateTime']['output']>;
  xp?: Maybe<Scalars['Int']['output']>;
};

export type CharacterFiltersInput = {
  guildId?: InputMaybe<Scalars['ID']['input']>;
  namePrefix?: InputMaybe<Scalars['String']['input']>;
  ownerId?: InputMaybe<Scalars['ID']['input']>;
  regionId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type CharacterListResult = {
  items: Array<CharacterType>;
  total: Scalars['Int']['output'];
};

export type CharacterLogListResult = {
  items: Array<CharacterLogType>;
  total: Scalars['Int']['output'];
};

export type CharacterLogType = {
  body: Scalars['String']['output'];
  characterId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  questId?: Maybe<Scalars['ID']['output']>;
};

export enum CharacterReviewStatus {
  Approved = 'APPROVED',
  Pending = 'PENDING',
  Rejected = 'REJECTED',
  Unknown = 'UNKNOWN'
}

export type CharacterType = {
  backgroundText?: Maybe<Scalars['String']['output']>;
  backstoryId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  daysActive: Scalars['Int']['output'];
  ddbLastAttempt?: Maybe<DdbAttemptType>;
  ddbMirror?: Maybe<CharacterDdbMirrorType>;
  ddbUrl?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  displayIcon?: Maybe<Scalars['String']['output']>;
  guildId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  /** Owner-supplied https portrait URL (D5); null shows the initials token. */
  imageUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  ownerId: Scalars['ID']['output'];
  pcxp: Scalars['Int']['output'];
  proficiencies: Array<DdbProficiencyType>;
  regionId?: Maybe<Scalars['ID']['output']>;
  shortCode: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  verificationStatus: CharacterReviewStatus;
  verificationSubmittedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type CloseQuestInput = {
  attendance: Array<ParticipationAttestationInput>;
  rewards: Array<QuestPcxpAwardInput>;
};

export type CoPlayerPage = {
  items: Array<CoPlayerType>;
  total: Scalars['Int']['output'];
};

export type CoPlayerType = {
  characterId: Scalars['ID']['output'];
  memberId: Scalars['ID']['output'];
  questCount: Scalars['Int']['output'];
};

export type CodexDirectoryResult = {
  items: Array<DocumentType>;
  total: Scalars['Int']['output'];
};

export type CodexEntryCardType = {
  backlinkCount: Scalars['Int']['output'];
  document: DocumentType;
  subjects: Array<DocumentLinkType>;
};


export type CodexEntryCardTypeSubjectsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export enum ColorMode {
  Dark = 'DARK',
  Light = 'LIGHT',
  System = 'SYSTEM'
}

export type CommandMeta = {
  idempotencyKey: Scalars['String']['input'];
};

export type CommandReceipt = {
  replayed: Scalars['Boolean']['output'];
};

export type CommunityDirectoryFiltersInput = {
  acceptingPlayers?: InputMaybe<Scalars['Boolean']['input']>;
  dmProfileStatus?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type CommunityDirectoryResult = {
  entries: Array<DirectoryEntryType>;
  total: Scalars['Int']['output'];
};

export type CountByKeyType = {
  count: Scalars['Int']['output'];
  key: Scalars['String']['output'];
};

export type CreateCharacterInput = {
  backgroundText?: InputMaybe<Scalars['String']['input']>;
  backstoryId?: InputMaybe<Scalars['ID']['input']>;
  catalogPickIds?: Array<Scalars['ID']['input']>;
  /** Required on create (D4): a https://www.dndbeyond.com/characters/<id> sheet URL. */
  ddbUrl?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  guildId?: InputMaybe<Scalars['ID']['input']>;
  /** Optional https URL, at most 2048 characters. */
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
  shortCode?: InputMaybe<Scalars['String']['input']>;
};

export type CreateQuestInput = {
  additionalInfo?: InputMaybe<Scalars['String']['input']>;
  apl?: InputMaybe<Scalars['Int']['input']>;
  arcId?: InputMaybe<Scalars['ID']['input']>;
  briefBody?: Scalars['String']['input'];
  dmId?: InputMaybe<Scalars['ID']['input']>;
  durationHours: Scalars['Float']['input'];
  genres?: Array<Scalars['String']['input']>;
  kinds?: Array<Scalars['String']['input']>;
  regionIds: Array<Scalars['ID']['input']>;
  scheduledAt: Scalars['DateTime']['input'];
  signupType?: InputMaybe<Scalars['String']['input']>;
  slotsMax?: Scalars['Int']['input'];
  tags?: Array<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  voiceChannelId?: InputMaybe<Scalars['String']['input']>;
};

export type CreationCatalogEntryType = {
  available: Scalars['Boolean']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  introducedByRegionId?: Maybe<Scalars['ID']['output']>;
  kind: Scalars['String']['output'];
  name: Scalars['String']['output'];
  retired: Scalars['Boolean']['output'];
};

export type CreationCatalogFiltersInput = {
  includeAll?: Scalars['Boolean']['input'];
  kind?: InputMaybe<Scalars['String']['input']>;
  regionId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreationCatalogPage = {
  items: Array<CreationCatalogEntryType>;
  total: Scalars['Int']['output'];
};

export type DdbProficiencyType = {
  kind: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type DdbAttemptType = {
  attemptedAt: Scalars['DateTime']['output'];
  finishedAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  provenance: Scalars['JSON']['output'];
  safeError?: Maybe<Scalars['String']['output']>;
  succeeded: Scalars['Boolean']['output'];
};

export type DdbSyncReceipt = {
  attemptedAt: Scalars['DateTime']['output'];
  character: CharacterType;
  safeError?: Maybe<Scalars['String']['output']>;
  succeeded: Scalars['Boolean']['output'];
};

export type DeliveryReceipt = {
  appliedRevision: Scalars['Int']['output'];
  deliveryStatus: Scalars['String']['output'];
  desiredRevision: Scalars['Int']['output'];
  jobId: Scalars['ID']['output'];
};

export enum Density {
  Comfortable = 'COMFORTABLE',
  Compact = 'COMPACT'
}

export type DirectoryEntryType = {
  acceptingPlayers?: Maybe<Scalars['Boolean']['output']>;
  availableDays: Array<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  dmProfileReviewRevision?: Maybe<Scalars['Int']['output']>;
  dmProfileStatus?: Maybe<Scalars['String']['output']>;
  handle: Scalars['String']['output'];
  isDm: Scalars['Boolean']['output'];
  memberId: Scalars['ID']['output'];
  roles: Array<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  tableInfo?: Maybe<Scalars['JSON']['output']>;
  tagline?: Maybe<Scalars['String']['output']>;
};

export type DiscordSettingsInput = {
  announceChannelId?: InputMaybe<Scalars['String']['input']>;
  roleId?: InputMaybe<Scalars['String']['input']>;
  voiceChannels: Array<DiscordVoiceChannelInput>;
};

export type DiscordSettingsType = {
  announceChannelId?: Maybe<Scalars['String']['output']>;
  roleId?: Maybe<Scalars['String']['output']>;
  voiceChannels: Array<DiscordVoiceChannelType>;
};

export type DiscordVoiceChannelInput = {
  channelId: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type DiscordVoiceChannelType = {
  channelId: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type DmLastSessionType = {
  quest: QuestType;
  recapDocument?: Maybe<DocumentType>;
};

export type DmProfileType = {
  acceptingPlayers: Scalars['Boolean']['output'];
  houseRules?: Maybe<Scalars['String']['output']>;
  memberId: Scalars['ID']['output'];
  philosophy?: Maybe<Scalars['String']['output']>;
  reviewRevision: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  tableInfo?: Maybe<Scalars['JSON']['output']>;
  tagline?: Maybe<Scalars['String']['output']>;
};

export type DmSessionHistoryResult = {
  items: Array<DmLastSessionType>;
  total: Scalars['Int']['output'];
};

export type DmStatsType = {
  lastSession?: Maybe<DmLastSessionType>;
  sessionCount: Scalars['Int']['output'];
};

export type DmSummaryFiltersInput = {
  questId?: InputMaybe<Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type DocumentAudienceInput = {
  policy?: InputMaybe<Array<Scalars['String']['input']>>;
  readerIds?: Array<Scalars['ID']['input']>;
  visibility: Scalars['String']['input'];
};

export type DocumentAuthorType = {
  handle: Scalars['String']['output'];
};

export type DocumentDraftInput = {
  body: Scalars['String']['input'];
  category?: InputMaybe<Scalars['String']['input']>;
  frontmatter: Scalars['JSON']['input'];
  kind: Scalars['String']['input'];
  policy?: InputMaybe<Array<Scalars['String']['input']>>;
  title: Scalars['String']['input'];
  visibility: Scalars['String']['input'];
};

export type DocumentEditInput = {
  body?: InputMaybe<Scalars['String']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  expectedRevision: Scalars['Int']['input'];
  frontmatter?: InputMaybe<Scalars['JSON']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type DocumentFiltersInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  createdBy?: InputMaybe<Scalars['ID']['input']>;
  kind?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  visibility?: InputMaybe<Scalars['String']['input']>;
};

export type DocumentLinkType = {
  documentId: Scalars['ID']['output'];
  relation: Scalars['String']['output'];
  targetId: Scalars['ID']['output'];
  targetType: Scalars['String']['output'];
};

export type DocumentListResult = {
  items: Array<DocumentType>;
  total: Scalars['Int']['output'];
};

export type DocumentRevisionPage = {
  items: Array<DocumentRevisionType>;
  total: Scalars['Int']['output'];
};

export type DocumentRevisionType = {
  body: Scalars['String']['output'];
  documentId: Scalars['ID']['output'];
  frontmatter: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  publishedBy?: Maybe<Scalars['ID']['output']>;
  reason: Scalars['String']['output'];
  recordedAt: Scalars['DateTime']['output'];
  recordedBy?: Maybe<Scalars['ID']['output']>;
  rev: Scalars['Int']['output'];
  title: Scalars['String']['output'];
  visibility?: Maybe<Scalars['String']['output']>;
};

export type DocumentSearchHitType = {
  category?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  questShortCode?: Maybe<Scalars['String']['output']>;
  slug: Scalars['String']['output'];
  snippet: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type DocumentType = {
  author?: Maybe<DocumentAuthorType>;
  authorId: Scalars['ID']['output'];
  canEditBody: Scalars['Boolean']['output'];
  canEditMetadata: Scalars['Boolean']['output'];
  category?: Maybe<Scalars['String']['output']>;
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  deletedBy?: Maybe<Scalars['ID']['output']>;
  effectiveBody?: Maybe<Scalars['String']['output']>;
  frontmatter: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  policy?: Maybe<Array<Scalars['String']['output']>>;
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  readerIds?: Maybe<Array<Scalars['ID']['output']>>;
  slug: Scalars['String']['output'];
  status: Scalars['String']['output'];
  summaryDerived?: Maybe<SummaryDerivedType>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  version: Scalars['Int']['output'];
  visibility: Scalars['String']['output'];
};

export type DowntimeInput = {
  goal?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  progress: Scalars['Int']['input'];
  status: Scalars['String']['input'];
  target?: InputMaybe<Scalars['Int']['input']>;
};

export type DowntimeProjectListResult = {
  items: Array<DowntimeProjectType>;
  total: Scalars['Int']['output'];
};

export type DowntimeProjectType = {
  characterId: Scalars['ID']['output'];
  goal?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  progress: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  target?: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type DriverProgressType = {
  dmSessionsCount: Scalars['Int']['output'];
  playerQuestsCount: Scalars['Int']['output'];
  tenureMonths: Scalars['Int']['output'];
};

export type GameCalendarType = {
  currentGameDate?: Maybe<GameDateType>;
  currentGameDay?: Maybe<Scalars['Int']['output']>;
  definition?: Maybe<Scalars['JSON']['output']>;
  monthGrid: Array<GameDayCellType>;
};

export type GameDateType = {
  day: Scalars['Int']['output'];
  eraAbbrev: Scalars['String']['output'];
  periodIndex: Scalars['Int']['output'];
  periodName: Scalars['String']['output'];
  periodType: Scalars['String']['output'];
  year: Scalars['Int']['output'];
};

export type GameDayCellType = {
  gameDate?: Maybe<GameDateType>;
  gameDay?: Maybe<Scalars['Int']['output']>;
  realDate: Scalars['Date']['output'];
};

export type HomeBannerInput = {
  body?: InputMaybe<Scalars['String']['input']>;
  ctaHref?: InputMaybe<Scalars['String']['input']>;
  ctaLabel?: InputMaybe<Scalars['String']['input']>;
  enabled: Scalars['Boolean']['input'];
  mediaKind?: InputMaybe<Scalars['String']['input']>;
  mediaLabel?: InputMaybe<Scalars['String']['input']>;
  mediaUrl?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type HomeBannerType = {
  body?: Maybe<Scalars['String']['output']>;
  ctaHref?: Maybe<Scalars['String']['output']>;
  ctaLabel?: Maybe<Scalars['String']['output']>;
  enabled: Scalars['Boolean']['output'];
  mediaKind?: Maybe<Scalars['String']['output']>;
  mediaLabel?: Maybe<Scalars['String']['output']>;
  mediaUrl?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type HomeBucketType = {
  category?: Maybe<Scalars['String']['output']>;
  documents: Array<DocumentType>;
};

export type HomeType = {
  communityStats: SiteStatsType;
  recentByCategory: Array<HomeBucketType>;
};

export type LieutenantAssignmentType = {
  grantedAt: Scalars['DateTime']['output'];
  grantedBy?: Maybe<Scalars['ID']['output']>;
  memberId: Scalars['ID']['output'];
  npcDocumentId: Scalars['ID']['output'];
};

export type LieutenantPage = {
  items: Array<LieutenantAssignmentType>;
  total: Scalars['Int']['output'];
};

export type MapCreateInput = {
  assetPath?: InputMaybe<Scalars['String']['input']>;
  atlasCode: Scalars['String']['input'];
  family: Scalars['String']['input'];
  grid?: Scalars['String']['input'];
  mapKind: Scalars['String']['input'];
  name: Scalars['String']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};

export type MapType = {
  assetPath?: Maybe<Scalars['String']['output']>;
  atlasCode: Scalars['String']['output'];
  canEdit: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<Scalars['ID']['output']>;
  family: Scalars['String']['output'];
  grid: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mapKind: Scalars['String']['output'];
  name: Scalars['String']['output'];
  pointcrawlEdges: Array<PointcrawlEdgeType>;
  pointcrawlNodes: Array<PointcrawlNodeType>;
  regionId?: Maybe<Scalars['ID']['output']>;
};


export type MapTypePointcrawlEdgesArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type MapTypePointcrawlNodesArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type MapUpdateInput = {
  assetPath?: InputMaybe<Scalars['String']['input']>;
  family: Scalars['String']['input'];
  grid: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type MemberActivityStatsType = {
  lastMessageAt?: Maybe<Scalars['DateTime']['output']>;
  longestSessionHours?: Maybe<Scalars['Float']['output']>;
  messages: Scalars['Float']['output'];
  questsPlayed: Scalars['Int']['output'];
  recentSessions: Array<ActivityEventType>;
  summariesAuthored: Scalars['Int']['output'];
  voiceByChannel: Array<ChannelVoiceMinutesType>;
  voiceMinutes: Scalars['Float']['output'];
};


export type MemberActivityStatsTypeRecentSessionsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type MemberActivityStatsTypeVoiceByChannelArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type MemberFiltersInput = {
  role?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type MemberListResult = {
  items: Array<MemberType>;
  total: Scalars['Int']['output'];
};

export type MemberProfileType = {
  activitySummary: ActivitySummaryType;
  availability: Array<AvailabilitySlotType>;
  dmProfile?: Maybe<DmProfileType>;
  member: MemberType;
  recentWeeks: Array<WeekActivityType>;
};


export type MemberProfileTypeRecentWeeksArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type MemberRoleBatchInput = {
  memberId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  roles: Array<Scalars['String']['input']>;
};

export type MemberRoleBatchResultType = {
  error?: Maybe<Scalars['String']['output']>;
  member?: Maybe<MemberType>;
  memberId: Scalars['ID']['output'];
  ok: Scalars['Boolean']['output'];
};

export type MemberSearchHitType = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  memberId: Scalars['ID']['output'];
};

export type MemberSettingsPatch = {
  colorblindSafe?: InputMaybe<Scalars['Boolean']['input']>;
  density?: InputMaybe<Density>;
  effectsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  mode?: InputMaybe<ColorMode>;
  notifyCharacterVerification?: InputMaybe<Scalars['Boolean']['input']>;
  notifyDmMentioned?: InputMaybe<Scalars['Boolean']['input']>;
  notifyDocumentActivity?: InputMaybe<Scalars['Boolean']['input']>;
  notifyQuestScheduled?: InputMaybe<Scalars['Boolean']['input']>;
  notifyQuestSignup?: InputMaybe<Scalars['Boolean']['input']>;
  reducedMotion?: InputMaybe<Scalars['Boolean']['input']>;
  theme?: InputMaybe<Theme>;
  timezone?: InputMaybe<Scalars['String']['input']>;
};

export type MemberSettingsType = {
  colorblindSafe: Scalars['Boolean']['output'];
  density: Density;
  effectsEnabled: Scalars['Boolean']['output'];
  memberId: Scalars['ID']['output'];
  mode: ColorMode;
  notifyCharacterVerification: Scalars['Boolean']['output'];
  notifyDmMentioned: Scalars['Boolean']['output'];
  notifyDocumentActivity: Scalars['Boolean']['output'];
  notifyQuestScheduled: Scalars['Boolean']['output'];
  notifyQuestSignup: Scalars['Boolean']['output'];
  reducedMotion: Scalars['Boolean']['output'];
  theme: Theme;
  timezone?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export enum MemberSortInput {
  Handle = 'HANDLE',
  JoinedAtAsc = 'JOINED_AT_ASC',
  JoinedAtDesc = 'JOINED_AT_DESC'
}

export type MemberType = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  discordId?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  joinedAt: Scalars['DateTime']['output'];
  roles: Array<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type MemberUnlockPage = {
  dmTier: Scalars['String']['output'];
  driverProgress: DriverProgressType;
  items: Array<MemberUnlockType>;
  total: Scalars['Int']['output'];
  unlockedAchievements: Array<Scalars['String']['output']>;
};

export type MemberUnlockType = {
  grantedBy?: Maybe<Scalars['ID']['output']>;
  memberId: Scalars['ID']['output'];
  source: Scalars['String']['output'];
  unlockableId: Scalars['ID']['output'];
  unlockedAt: Scalars['DateTime']['output'];
};

export type Mutation = {
  /**
   * Layout placeholder until deprecated; real fields live on extend type Mutation blocks.
   * @deprecated M1 layout placeholder. Real Mutation fields extend this root.
   */
  _contractLayoutStub: Scalars['Boolean']['output'];
  acknowledgeSuppressedNotifications: NotificationWriteReceipt;
  addQuestParticipant: QuestParticipantType;
  adjustPcxp: ProgressionEntryType;
  assignArchon: ArchonAssignmentType;
  assignLieutenant: LieutenantAssignmentType;
  attestQuestParticipation: Array<QuestParticipantType>;
  closeQuest: QuestType;
  createBackstory: BackstoryType;
  createCharacter: CharacterType;
  createDocument: DocumentType;
  createMap: MapType;
  createQuest: QuestType;
  createRegion: RegionType;
  createTimeAnchor: TimeAnchorType;
  decideDmProfileVerification: DmProfileType;
  decideVerification: VerificationType;
  deleteCharacter: CommandReceipt;
  deleteCharacterLog: CommandReceipt;
  deleteDocument: CommandReceipt;
  deleteQuest: CommandReceipt;
  deleteRegion: CommandReceipt;
  editPublishedDocument: DocumentType;
  grantUnlock: MemberUnlockType;
  linkPointcrawlEntry: PointcrawlEntryLinkType;
  logCharacterEvent: CharacterLogType;
  markNotificationsRead: NotificationWriteReceipt;
  publishDocument: DocumentType;
  publishQuestPlayerList: DeliveryReceipt;
  redriveDiscordDelivery: DeliveryReceipt;
  removeQuestFromArc: QuestType;
  removeQuestParticipant: QuestParticipantType;
  restoreCharacter: CharacterType;
  restoreDocument: DocumentType;
  restoreQuest: QuestType;
  restoreRegion: RegionType;
  retireCharacter: CharacterType;
  revokeArchon: CommandReceipt;
  revokeLieutenant: CommandReceipt;
  selectQuestParticipants: Array<QuestParticipantType>;
  setCharacterGuild: CharacterType;
  setDocumentVisibility: DocumentType;
  setMemberRoles: MemberType;
  setMemberRolesBatch: Array<MemberRoleBatchResultType>;
  setMyAvailability: Array<AvailabilitySlotType>;
  setMyPrivateNotes: MyPrivateNotesType;
  setPointcrawlEdge: PointcrawlEdgeType;
  setPointcrawlNodeState: PointcrawlNodeType;
  setQuestPointcrawlLinks: Array<QuestPointcrawlLinkType>;
  setUnlockableActive: UnlockableType;
  signupForQuest: QuestParticipantType;
  submitDmProfileForVerification: DmProfileType;
  submitForVerification: CharacterType;
  syncCharacterDdb: DdbSyncReceipt;
  syncQuestDiscord: DeliveryReceipt;
  transitionQuestStatus: QuestType;
  transitionRegion: RegionType;
  unlinkPointcrawlEntry: CommandReceipt;
  unpublishDocument: DocumentType;
  updateBackstory: BackstoryType;
  updateCharacterProfile: CharacterType;
  updateDiscordSettings: DiscordSettingsType;
  updateDocument: DocumentType;
  updateGameCalendar: GameCalendarType;
  updateHomeBanner: HomeBannerType;
  updateMap: MapType;
  updateMyDmProfile: DmProfileType;
  updateMyProfile: MemberType;
  updateMySettings: MemberSettingsType;
  updateQuest: QuestType;
  updateQuestAnnouncementRoleSetting: QuestAnnouncementRoleSettingType;
  updateRegion: RegionType;
  updateTimeAnchor: TimeAnchorType;
  upsertCreationCatalogEntry: CreationCatalogEntryType;
  upsertDowntimeProject: DowntimeProjectType;
  upsertPointcrawlNode: PointcrawlNodeType;
  upsertQuestArc: QuestArcType;
  upsertQuestSummary: DocumentType;
  upsertUnlockable: UnlockableType;
  withdrawFromQuest: QuestParticipantType;
};


export type MutationAcknowledgeSuppressedNotificationsArgs = {
  limit?: Scalars['Int']['input'];
  meta: CommandMeta;
};


export type MutationAddQuestParticipantArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationAdjustPcxpArgs = {
  amount: Scalars['Int']['input'];
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  note: Scalars['String']['input'];
};


export type MutationAssignArchonArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  regionId: Scalars['ID']['input'];
};


export type MutationAssignLieutenantArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  npcDocumentId: Scalars['ID']['input'];
};


export type MutationAttestQuestParticipationArgs = {
  entries: Array<ParticipationAttestationInput>;
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationCloseQuestArgs = {
  id: Scalars['ID']['input'];
  input: CloseQuestInput;
  meta: CommandMeta;
};


export type MutationCreateBackstoryArgs = {
  input: BackstoryInput;
  meta: CommandMeta;
};


export type MutationCreateCharacterArgs = {
  input: CreateCharacterInput;
  meta: CommandMeta;
};


export type MutationCreateDocumentArgs = {
  input: DocumentDraftInput;
  meta: CommandMeta;
};


export type MutationCreateMapArgs = {
  input: MapCreateInput;
  meta: CommandMeta;
};


export type MutationCreateQuestArgs = {
  input: CreateQuestInput;
  meta: CommandMeta;
};


export type MutationCreateRegionArgs = {
  input: RegionInput;
  meta: CommandMeta;
};


export type MutationCreateTimeAnchorArgs = {
  input: TimeAnchorInput;
  meta: CommandMeta;
};


export type MutationDecideDmProfileVerificationArgs = {
  expectedRevision: Scalars['Int']['input'];
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  note?: InputMaybe<Scalars['String']['input']>;
  verdict: VerificationVerdict;
};


export type MutationDecideVerificationArgs = {
  characterId: Scalars['ID']['input'];
  expectedSubmittedAt: Scalars['DateTime']['input'];
  meta: CommandMeta;
  note?: InputMaybe<Scalars['String']['input']>;
  verdict: VerificationVerdict;
};


export type MutationDeleteCharacterArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationDeleteCharacterLogArgs = {
  characterId: Scalars['ID']['input'];
  logId: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationDeleteDocumentArgs = {
  expectedRevision: Scalars['Int']['input'];
  id: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationDeleteQuestArgs = {
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationDeleteRegionArgs = {
  meta: CommandMeta;
  regionId: Scalars['ID']['input'];
};


export type MutationEditPublishedDocumentArgs = {
  id: Scalars['ID']['input'];
  input: DocumentEditInput;
  meta: CommandMeta;
};


export type MutationGrantUnlockArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  note: Scalars['String']['input'];
  unlockableId: Scalars['ID']['input'];
};


export type MutationLinkPointcrawlEntryArgs = {
  documentId: Scalars['ID']['input'];
  mapId: Scalars['ID']['input'];
  meta: CommandMeta;
  nodeId: Scalars['ID']['input'];
  relation: Scalars['String']['input'];
};


export type MutationLogCharacterEventArgs = {
  body: Scalars['String']['input'];
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  questId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationMarkNotificationsReadArgs = {
  ids: Array<Scalars['ID']['input']>;
  meta: CommandMeta;
};


export type MutationPublishDocumentArgs = {
  expectedRevision: Scalars['Int']['input'];
  id: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationPublishQuestPlayerListArgs = {
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationRedriveDiscordDeliveryArgs = {
  jobId: Scalars['ID']['input'];
  meta: CommandMeta;
  reason: Scalars['String']['input'];
};


export type MutationRemoveQuestFromArcArgs = {
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationRemoveQuestParticipantArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationRestoreCharacterArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationRestoreDocumentArgs = {
  id: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationRestoreQuestArgs = {
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationRestoreRegionArgs = {
  meta: CommandMeta;
  regionId: Scalars['ID']['input'];
};


export type MutationRetireCharacterArgs = {
  characterId: Scalars['ID']['input'];
  expectedUpdatedAt: Scalars['DateTime']['input'];
  meta: CommandMeta;
};


export type MutationRevokeArchonArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  regionId: Scalars['ID']['input'];
};


export type MutationRevokeLieutenantArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  npcDocumentId: Scalars['ID']['input'];
};


export type MutationSelectQuestParticipantsArgs = {
  characterIds: Array<Scalars['ID']['input']>;
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationSetCharacterGuildArgs = {
  characterId: Scalars['ID']['input'];
  guildId?: InputMaybe<Scalars['ID']['input']>;
  meta: CommandMeta;
};


export type MutationSetDocumentVisibilityArgs = {
  expectedRevision: Scalars['Int']['input'];
  id: Scalars['ID']['input'];
  input: DocumentAudienceInput;
  meta: CommandMeta;
};


export type MutationSetMemberRolesArgs = {
  memberId: Scalars['ID']['input'];
  meta: CommandMeta;
  note?: InputMaybe<Scalars['String']['input']>;
  roles: Array<Scalars['String']['input']>;
};


export type MutationSetMemberRolesBatchArgs = {
  changes: Array<MemberRoleBatchInput>;
  meta: CommandMeta;
};


export type MutationSetMyAvailabilityArgs = {
  meta: CommandMeta;
  slots: Array<AvailabilitySlotInput>;
};


export type MutationSetMyPrivateNotesArgs = {
  body: Scalars['String']['input'];
  meta: CommandMeta;
};


export type MutationSetPointcrawlEdgeArgs = {
  input: PointcrawlEdgeInput;
  mapId: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationSetPointcrawlNodeStateArgs = {
  mapId: Scalars['ID']['input'];
  meta: CommandMeta;
  nodeId: Scalars['ID']['input'];
  state: PointcrawlNodeState;
};


export type MutationSetQuestPointcrawlLinksArgs = {
  links: Array<QuestPointcrawlLinkInput>;
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationSetUnlockableActiveArgs = {
  active: Scalars['Boolean']['input'];
  id: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationSignupForQuestArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationSubmitDmProfileForVerificationArgs = {
  expectedRevision: Scalars['Int']['input'];
  meta: CommandMeta;
};


export type MutationSubmitForVerificationArgs = {
  characterId: Scalars['ID']['input'];
  expectedUpdatedAt: Scalars['DateTime']['input'];
  meta: CommandMeta;
};


export type MutationSyncCharacterDdbArgs = {
  characterId: Scalars['ID']['input'];
  ddbUrl: Scalars['String']['input'];
  meta: CommandMeta;
};


export type MutationSyncQuestDiscordArgs = {
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};


export type MutationTransitionQuestStatusArgs = {
  id: Scalars['ID']['input'];
  meta: CommandMeta;
  to: Scalars['String']['input'];
};


export type MutationTransitionRegionArgs = {
  id: Scalars['ID']['input'];
  meta: CommandMeta;
  note: Scalars['String']['input'];
  to: Scalars['String']['input'];
};


export type MutationUnlinkPointcrawlEntryArgs = {
  documentId: Scalars['ID']['input'];
  mapId: Scalars['ID']['input'];
  meta: CommandMeta;
  nodeId: Scalars['ID']['input'];
  relation: Scalars['String']['input'];
};


export type MutationUnpublishDocumentArgs = {
  expectedRevision: Scalars['Int']['input'];
  id: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationUpdateBackstoryArgs = {
  id: Scalars['ID']['input'];
  input: BackstoryInput;
  meta: CommandMeta;
};


export type MutationUpdateCharacterProfileArgs = {
  characterId: Scalars['ID']['input'];
  input: UpdateCharacterProfileInput;
  meta: CommandMeta;
};


export type MutationUpdateDiscordSettingsArgs = {
  input: DiscordSettingsInput;
  meta: CommandMeta;
};


export type MutationUpdateDocumentArgs = {
  id: Scalars['ID']['input'];
  input: DocumentEditInput;
  meta: CommandMeta;
};


export type MutationUpdateGameCalendarArgs = {
  definition: Scalars['JSON']['input'];
  meta: CommandMeta;
};


export type MutationUpdateHomeBannerArgs = {
  input: HomeBannerInput;
  meta: CommandMeta;
};


export type MutationUpdateMapArgs = {
  id: Scalars['ID']['input'];
  input: MapUpdateInput;
  meta: CommandMeta;
};


export type MutationUpdateMyDmProfileArgs = {
  input: UpdateDmProfileInput;
  meta: CommandMeta;
};


export type MutationUpdateMyProfileArgs = {
  input: UpdateMyProfileInput;
  meta: CommandMeta;
};


export type MutationUpdateMySettingsArgs = {
  input: MemberSettingsPatch;
  meta: CommandMeta;
};


export type MutationUpdateQuestArgs = {
  id: Scalars['ID']['input'];
  input: QuestEditInput;
  meta: CommandMeta;
};


export type MutationUpdateQuestAnnouncementRoleSettingArgs = {
  input: AnnouncementRoleInput;
  meta: CommandMeta;
};


export type MutationUpdateRegionArgs = {
  id: Scalars['ID']['input'];
  input: RegionInput;
  meta: CommandMeta;
};


export type MutationUpdateTimeAnchorArgs = {
  id: Scalars['ID']['input'];
  input: TimeAnchorInput;
  meta: CommandMeta;
};


export type MutationUpsertCreationCatalogEntryArgs = {
  input: UpsertCreationCatalogEntryInput;
  meta: CommandMeta;
};


export type MutationUpsertDowntimeProjectArgs = {
  characterId: Scalars['ID']['input'];
  input: DowntimeInput;
  meta: CommandMeta;
};


export type MutationUpsertPointcrawlNodeArgs = {
  input: PointcrawlNodeInput;
  mapId: Scalars['ID']['input'];
  meta: CommandMeta;
};


export type MutationUpsertQuestArcArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  meta: CommandMeta;
  name: Scalars['String']['input'];
};


export type MutationUpsertQuestSummaryArgs = {
  input: QuestSummaryInput;
  meta: CommandMeta;
};


export type MutationUpsertUnlockableArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  input: UpsertUnlockableInput;
  meta: CommandMeta;
};


export type MutationWithdrawFromQuestArgs = {
  characterId: Scalars['ID']['input'];
  meta: CommandMeta;
  questId: Scalars['ID']['input'];
};

export type MyPersonalizationType = {
  settings?: Maybe<MemberSettingsType>;
};

/**
 * The caller's own private notes (D6): Markdown, at most 10,000 characters.
 * Readable and writable only by the member who owns them; never exposed on
 * any member, profile or admin read.
 */
export type MyPrivateNotesType = {
  body: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type NotificationConnection = {
  hasMore: Scalars['Boolean']['output'];
  items: Array<NotificationType>;
  nextBefore?: Maybe<Scalars['String']['output']>;
};

export type NotificationType = {
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  label: Scalars['String']['output'];
  readAt?: Maybe<Scalars['DateTime']['output']>;
  subjectCode?: Maybe<Scalars['String']['output']>;
  subjectId: Scalars['ID']['output'];
  subjectType: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type NotificationWriteReceipt = {
  affectedCount: Scalars['Int']['output'];
  replayed: Scalars['Boolean']['output'];
};

export type OpenQuestSeatType = {
  dmId: Scalars['ID']['output'];
  filledCount: Scalars['Int']['output'];
  openSeats: Scalars['Int']['output'];
  questId: Scalars['ID']['output'];
  regionIds: Array<Scalars['ID']['output']>;
  scheduledAt: Scalars['DateTime']['output'];
  shortCode: Scalars['String']['output'];
  slotsMax: Scalars['Int']['output'];
  status: Scalars['String']['output'];
};

export type OpenQuestSeatsResult = {
  entries: Array<OpenQuestSeatType>;
  total: Scalars['Int']['output'];
};

export type ParticipationAttestationInput = {
  characterId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};

export type ParticipationPage = {
  items: Array<QuestParticipantType>;
  total: Scalars['Int']['output'];
};

export type PointcrawlEdgeInput = {
  directed: Scalars['Boolean']['input'];
  documentId?: InputMaybe<Scalars['ID']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  kind: Scalars['String']['input'];
  label?: InputMaybe<Scalars['String']['input']>;
  nodeA: Scalars['ID']['input'];
  nodeB: Scalars['ID']['input'];
};

export type PointcrawlEdgeType = {
  directed: Scalars['Boolean']['output'];
  documentId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  label?: Maybe<Scalars['String']['output']>;
  mapId: Scalars['ID']['output'];
  nodeA: Scalars['ID']['output'];
  nodeB: Scalars['ID']['output'];
};

export type PointcrawlEntryLinkType = {
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['ID']['output'];
  documentId: Scalars['ID']['output'];
  mapId: Scalars['ID']['output'];
  nodeId: Scalars['ID']['output'];
  relation: Scalars['String']['output'];
};

export type PointcrawlNodeInput = {
  id?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  submapId?: InputMaybe<Scalars['ID']['input']>;
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

/** Admin-set exploration label on a hex. Display only: it does not change who can see or reach the hex. */
export enum PointcrawlNodeState {
  Locked = 'LOCKED',
  Mapped = 'MAPPED',
  Unlocked = 'UNLOCKED'
}

export type PointcrawlNodeType = {
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  linkedEntries: Array<PointcrawlEntryLinkType>;
  mapId: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  state: PointcrawlNodeState;
  submapId?: Maybe<Scalars['ID']['output']>;
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};


export type PointcrawlNodeTypeLinkedEntriesArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export enum PreviewAudience {
  Dm = 'DM',
  Player = 'PLAYER'
}

export type ProgressionEntryType = {
  amount?: Maybe<Scalars['Int']['output']>;
  characterId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  note?: Maybe<Scalars['String']['output']>;
  questId?: Maybe<Scalars['ID']['output']>;
  recordedAt: Scalars['DateTime']['output'];
  recordedBy?: Maybe<Scalars['ID']['output']>;
};

export type ProgressionListResult = {
  items: Array<ProgressionEntryType>;
  total: Scalars['Int']['output'];
};

export type Query = {
  /**
   * Layout placeholder until deprecated; real fields live on extend type Query blocks.
   * @deprecated M1 layout placeholder. Real Query fields extend this root.
   */
  _contractLayoutStub: Scalars['Boolean']['output'];
  adminCharacterDirectory: AdminCharacterDirectoryType;
  adminCommunityStats: AdminCommunityStatsType;
  adminOperations: AdminOperationsType;
  archonAssignments: ArchonPage;
  auditBody: Array<BodySpanAudit>;
  backstories: BackstoryPage;
  character?: Maybe<CharacterType>;
  characterLogs: CharacterLogListResult;
  characterProgression: ProgressionListResult;
  characterSummaries: DocumentListResult;
  characterVerificationHistory: VerificationPage;
  characters: CharacterListResult;
  coPlayers: CoPlayerPage;
  codexCategories: Array<CategoryCountType>;
  codexDirectory: CodexDirectoryResult;
  codexEntry?: Maybe<CodexEntryCardType>;
  communityDirectory: CommunityDirectoryResult;
  creationCatalog: CreationCatalogPage;
  discordDeliveryMode: Scalars['String']['output'];
  discordSettings: DiscordSettingsType;
  dmSessionHistory: DmSessionHistoryResult;
  dmStats?: Maybe<DmStatsType>;
  dmSummaries: DocumentListResult;
  document?: Maybe<DocumentType>;
  documentBacklinks: Array<DocumentLinkType>;
  documentById?: Maybe<DocumentType>;
  documentRevisions: DocumentRevisionPage;
  documents: DocumentListResult;
  documentsTrash: DocumentListResult;
  downtimeProjects: DowntimeProjectListResult;
  gameCalendar: GameCalendarType;
  gameDate?: Maybe<GameDateType>;
  home: HomeType;
  homeBanner: HomeBannerType;
  lieutenantAssignments: LieutenantPage;
  map?: Maybe<MapType>;
  maps: Array<MapType>;
  member?: Maybe<MemberType>;
  memberActivityStats?: Maybe<MemberActivityStatsType>;
  memberAvailability: Array<AvailabilitySlotType>;
  memberByDiscordId?: Maybe<MemberType>;
  memberMe: MemberType;
  memberProfile?: Maybe<MemberProfileType>;
  memberRoleHistory: RoleChangePage;
  members: MemberListResult;
  myAvailability: Array<AvailabilitySlotType>;
  myCharacters: CharacterListResult;
  myNotifications: NotificationConnection;
  myPersonalization?: Maybe<MyPersonalizationType>;
  myPrivateNotes: MyPrivateNotesType;
  myQuestSignups: ParticipationPage;
  myUnlocks: MemberUnlockPage;
  myUnreadNotificationCount: Scalars['Int']['output'];
  openQuestSeats: OpenQuestSeatsResult;
  participationsByCharacter: ParticipationPage;
  pendingCharacterVerifications: AdminCharacterDirectoryType;
  pendingDmProfileVerifications: CommunityDirectoryResult;
  previewBody: Scalars['String']['output'];
  quest?: Maybe<QuestType>;
  questAnnouncementRoleSetting: QuestAnnouncementRoleSettingType;
  questArc?: Maybe<QuestArcType>;
  questArcs: QuestArcListResult;
  questBoard: QuestListResult;
  questGenreOptions: Array<Scalars['String']['output']>;
  questStateCounts: Array<QuestStateCountType>;
  questSummaries: QuestSummariesResult;
  questVoiceChannels: Array<DiscordVoiceChannelType>;
  quests: QuestListResult;
  realDates: RealDatePage;
  recentlyClosedQuests: QuestListResult;
  regionActivity?: Maybe<RegionActivityType>;
  regionCounts?: Maybe<RegionCountsType>;
  regions: Array<RegionType>;
  search: SearchResultType;
  searchableKinds: Array<SearchKindType>;
  siteStats: SiteStatsType;
  timeAnchors: TimeAnchorPage;
  unlockablesCatalog: UnlockablePage;
};


export type QueryAdminCharacterDirectoryArgs = {
  filters?: InputMaybe<AdminCharacterDirectoryFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryAdminOperationsArgs = {
  deliveryState?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryArchonAssignmentsArgs = {
  limit?: Scalars['Int']['input'];
  memberId?: InputMaybe<Scalars['ID']['input']>;
  offset?: Scalars['Int']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryAuditBodyArgs = {
  body: Scalars['String']['input'];
};


export type QueryBackstoriesArgs = {
  filters?: InputMaybe<BackstoryFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCharacterArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  shortCode?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCharacterLogsArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCharacterProgressionArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCharacterSummariesArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCharacterVerificationHistoryArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCharactersArgs = {
  filters?: InputMaybe<CharacterFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCoPlayersArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCodexDirectoryArgs = {
  categoryPrefix?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCodexEntryArgs = {
  slug: Scalars['String']['input'];
};


export type QueryCommunityDirectoryArgs = {
  filters?: InputMaybe<CommunityDirectoryFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCreationCatalogArgs = {
  filters?: InputMaybe<CreationCatalogFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDmSessionHistoryArgs = {
  limit?: Scalars['Int']['input'];
  memberId: Scalars['ID']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDmStatsArgs = {
  memberId: Scalars['ID']['input'];
};


export type QueryDmSummariesArgs = {
  filters?: InputMaybe<DmSummaryFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDocumentArgs = {
  slug: Scalars['String']['input'];
};


export type QueryDocumentBacklinksArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
};


export type QueryDocumentByIdArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDocumentRevisionsArgs = {
  documentId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDocumentsArgs = {
  filters?: InputMaybe<DocumentFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDocumentsTrashArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryDowntimeProjectsArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryGameCalendarArgs = {
  realFrom: Scalars['Date']['input'];
  realTo: Scalars['Date']['input'];
};


export type QueryGameDateArgs = {
  realDate: Scalars['Date']['input'];
};


export type QueryLieutenantAssignmentsArgs = {
  limit?: Scalars['Int']['input'];
  memberId?: InputMaybe<Scalars['ID']['input']>;
  npcDocumentId?: InputMaybe<Scalars['ID']['input']>;
  offset?: Scalars['Int']['input'];
};


export type QueryMapArgs = {
  atlasCode: Scalars['String']['input'];
};


export type QueryMapsArgs = {
  family?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  mapKind?: InputMaybe<Scalars['String']['input']>;
  offset?: Scalars['Int']['input'];
};


export type QueryMemberArgs = {
  handle?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryMemberActivityStatsArgs = {
  memberId: Scalars['ID']['input'];
};


export type QueryMemberAvailabilityArgs = {
  memberId: Scalars['ID']['input'];
};


export type QueryMemberByDiscordIdArgs = {
  discordId: Scalars['String']['input'];
};


export type QueryMemberProfileArgs = {
  handle: Scalars['String']['input'];
};


export type QueryMemberRoleHistoryArgs = {
  limit?: Scalars['Int']['input'];
  memberId: Scalars['ID']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryMembersArgs = {
  filters?: InputMaybe<MemberFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  sort?: InputMaybe<MemberSortInput>;
};


export type QueryMyCharactersArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryMyNotificationsArgs = {
  before?: InputMaybe<Scalars['String']['input']>;
  limit: Scalars['Int']['input'];
  unreadOnly?: Scalars['Boolean']['input'];
};


export type QueryMyQuestSignupsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryMyUnlocksArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryOpenQuestSeatsArgs = {
  dmId?: InputMaybe<Scalars['ID']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryParticipationsByCharacterArgs = {
  characterId: Scalars['ID']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryPendingCharacterVerificationsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryPendingDmProfileVerificationsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryPreviewBodyArgs = {
  audience: PreviewAudience;
  authorId?: InputMaybe<Scalars['ID']['input']>;
  body: Scalars['String']['input'];
  memberHandle?: InputMaybe<Scalars['String']['input']>;
};


export type QueryQuestArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  shortCode?: InputMaybe<Scalars['String']['input']>;
};


export type QueryQuestArcArgs = {
  id: Scalars['ID']['input'];
};


export type QueryQuestArcsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryQuestBoardArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryQuestStateCountsArgs = {
  filters?: InputMaybe<QuestStateCountsFiltersInput>;
};


export type QueryQuestSummariesArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  questId: Scalars['ID']['input'];
};


export type QueryQuestsArgs = {
  filters?: InputMaybe<QuestFiltersInput>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryRealDatesArgs = {
  gameDay: Scalars['Int']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryRecentlyClosedQuestsArgs = {
  closedSince?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  regionId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryRegionActivityArgs = {
  atlasCode: Scalars['String']['input'];
};


export type QueryRegionCountsArgs = {
  regionId: Scalars['ID']['input'];
};


export type QueryRegionsArgs = {
  kind?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QuerySearchArgs = {
  kinds?: InputMaybe<Array<Scalars['String']['input']>>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  query: Scalars['String']['input'];
};


export type QueryTimeAnchorsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryUnlockablesCatalogArgs = {
  activeOnly?: Scalars['Boolean']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type QuestAnnouncementRoleSettingType = {
  enabled: Scalars['Boolean']['output'];
  roleId?: Maybe<Scalars['String']['output']>;
};

export type QuestArcListResult = {
  items: Array<QuestArcType>;
  total: Scalars['Int']['output'];
};

export type QuestArcType = {
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  questCount: Scalars['Int']['output'];
  quests: Array<QuestType>;
};


export type QuestArcTypeQuestsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};

export type QuestDiscordDeliveryType = {
  appliedRevision: Scalars['Int']['output'];
  desiredRevision: Scalars['Int']['output'];
  errorCode?: Maybe<Scalars['String']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  eventState?: Maybe<Scalars['String']['output']>;
  jobId?: Maybe<Scalars['ID']['output']>;
  messageState?: Maybe<Scalars['String']['output']>;
  nextRetryAt?: Maybe<Scalars['DateTime']['output']>;
  overallStatus: Scalars['String']['output'];
  threadState?: Maybe<Scalars['String']['output']>;
};

export type QuestDmType = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  handle: Scalars['String']['output'];
};

export type QuestEditInput = {
  additionalInfo?: InputMaybe<Scalars['String']['input']>;
  apl?: InputMaybe<Scalars['Int']['input']>;
  arcId?: InputMaybe<Scalars['ID']['input']>;
  briefBody?: InputMaybe<Scalars['String']['input']>;
  dmId?: InputMaybe<Scalars['ID']['input']>;
  durationHours?: InputMaybe<Scalars['Float']['input']>;
  expectedUpdatedAt: Scalars['DateTime']['input'];
  genres?: InputMaybe<Array<Scalars['String']['input']>>;
  kinds?: InputMaybe<Array<Scalars['String']['input']>>;
  regionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  scheduledAt?: InputMaybe<Scalars['DateTime']['input']>;
  signupType?: InputMaybe<Scalars['String']['input']>;
  slotsMax?: InputMaybe<Scalars['Int']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
  voiceChannelId?: InputMaybe<Scalars['String']['input']>;
};

export type QuestFiltersInput = {
  arcId?: InputMaybe<Scalars['ID']['input']>;
  displayStatus?: InputMaybe<Scalars['String']['input']>;
  dmId?: InputMaybe<Scalars['ID']['input']>;
  genre?: InputMaybe<Scalars['String']['input']>;
  kind?: InputMaybe<Scalars['String']['input']>;
  regionId?: InputMaybe<Scalars['ID']['input']>;
  scheduledFrom?: InputMaybe<Scalars['DateTime']['input']>;
  scheduledTo?: InputMaybe<Scalars['DateTime']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  shortCodes?: InputMaybe<Array<Scalars['String']['input']>>;
  status?: InputMaybe<Scalars['String']['input']>;
  tag?: InputMaybe<Scalars['String']['input']>;
};

export type QuestListResult = {
  items: Array<QuestType>;
  total: Scalars['Int']['output'];
};

export type QuestParticipantType = {
  characterId: Scalars['ID']['output'];
  characterName: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  lastPlayedAt?: Maybe<Scalars['DateTime']['output']>;
  manual: Scalars['Boolean']['output'];
  memberAvatarUrl?: Maybe<Scalars['String']['output']>;
  memberDisplayName: Scalars['String']['output'];
  memberHandle: Scalars['String']['output'];
  memberId: Scalars['ID']['output'];
  questId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type QuestPcxpAwardInput = {
  characterId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  pcxp: Scalars['Int']['input'];
};

export type QuestPointcrawlLinkInput = {
  pointcrawlNodeId: Scalars['ID']['input'];
  role: Scalars['String']['input'];
};

export type QuestPointcrawlLinkType = {
  name: Scalars['String']['output'];
  pointcrawlNodeId: Scalars['ID']['output'];
  questId: Scalars['ID']['output'];
  role: Scalars['String']['output'];
};

export type QuestStateCountType = {
  count: Scalars['Int']['output'];
  state: Scalars['String']['output'];
};

export type QuestStateCountsFiltersInput = {
  arcId?: InputMaybe<Scalars['ID']['input']>;
  dmId?: InputMaybe<Scalars['ID']['input']>;
  kind?: InputMaybe<Scalars['String']['input']>;
  regionId?: InputMaybe<Scalars['ID']['input']>;
  tag?: InputMaybe<Scalars['String']['input']>;
};

export type QuestSummariesResult = {
  summaries: Array<DocumentType>;
  totals: QuestSummaryTotalsType;
};

export type QuestSummaryInput = {
  body: Scalars['String']['input'];
  characterId?: InputMaybe<Scalars['ID']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
  expectedRevision?: InputMaybe<Scalars['Int']['input']>;
  frontmatter: Scalars['JSON']['input'];
  questIds: Array<Scalars['ID']['input']>;
  title: Scalars['String']['input'];
  visibility: Scalars['String']['input'];
};

export type QuestSummaryTotalsType = {
  coverage: RewardCoverage;
  totalPcxpAwarded?: Maybe<Scalars['Int']['output']>;
};

export type QuestType = {
  announceError?: Maybe<Scalars['String']['output']>;
  apl?: Maybe<Scalars['Int']['output']>;
  arc?: Maybe<QuestArcType>;
  arcId?: Maybe<Scalars['ID']['output']>;
  briefDocument?: Maybe<DocumentType>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['ID']['output'];
  discordDelivery: QuestDiscordDeliveryType;
  discordEventId?: Maybe<Scalars['String']['output']>;
  discordMessageId?: Maybe<Scalars['String']['output']>;
  displayStatus?: Maybe<Scalars['String']['output']>;
  dm?: Maybe<QuestDmType>;
  dmId: Scalars['ID']['output'];
  dmTable?: Maybe<DocumentType>;
  documentId?: Maybe<Scalars['ID']['output']>;
  durationHours: Scalars['Float']['output'];
  eventUrl?: Maybe<Scalars['String']['output']>;
  filledCount: Scalars['Int']['output'];
  genres: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  kinds: Array<Scalars['String']['output']>;
  participants: Array<QuestParticipantType>;
  pointcrawlLinks: Array<QuestPointcrawlLinkType>;
  regions: Array<Scalars['ID']['output']>;
  scheduledAt: Scalars['DateTime']['output'];
  shortCode: Scalars['String']['output'];
  signupType?: Maybe<Scalars['String']['output']>;
  slotsMax: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  tags: Array<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  voiceChannelId?: Maybe<Scalars['String']['output']>;
};


export type QuestTypeParticipantsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QuestTypePointcrawlLinksArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  role?: InputMaybe<Scalars['String']['input']>;
};

export type RealDatePage = {
  items: Array<Scalars['Date']['output']>;
  total: Scalars['Int']['output'];
};

export type RegionActivityQuestRefType = {
  filledCount: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  scheduledAt: Scalars['DateTime']['output'];
  shortCode: Scalars['String']['output'];
  slotsMax: Scalars['Int']['output'];
};

export type RegionActivityType = {
  fillingCount: Scalars['Int']['output'];
  liveCount: Scalars['Int']['output'];
  liveQuests: Array<RegionActivityQuestRefType>;
  openQuests: Array<RegionActivityQuestRefType>;
  regionId: Scalars['ID']['output'];
  regionName: Scalars['String']['output'];
  scheduledCount: Scalars['Int']['output'];
};

export type RegionCountsType = {
  featureCount: Scalars['Int']['output'];
  pointcrawlNodeCount: Scalars['Int']['output'];
  questCount: Scalars['Int']['output'];
  regionId: Scalars['ID']['output'];
};

export type RegionInput = {
  charterDeadline?: InputMaybe<Scalars['DateTime']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
  kind: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type RegionType = {
  canCreateMap: Scalars['Boolean']['output'];
  charterDeadline?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  documentId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export enum RewardCoverage {
  Complete = 'COMPLETE',
  LegacyUnknown = 'LEGACY_UNKNOWN'
}

export type RoleChangePage = {
  items: Array<RoleChangeType>;
  total: Scalars['Int']['output'];
};

export type RoleChangeType = {
  changedBy: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  memberId: Scalars['ID']['output'];
  newRoles: Array<Scalars['String']['output']>;
  note?: Maybe<Scalars['String']['output']>;
  occurredAt: Scalars['DateTime']['output'];
  oldRoles: Array<Scalars['String']['output']>;
};

export type ScheduledWorkStatusType = {
  expectedSlot: Scalars['DateTime']['output'];
  jobId?: Maybe<Scalars['ID']['output']>;
  kind: Scalars['String']['output'];
  lastFinishedAt?: Maybe<Scalars['DateTime']['output']>;
  lastStartedAt?: Maybe<Scalars['DateTime']['output']>;
  outcome: Scalars['String']['output'];
  safeErrorCode?: Maybe<Scalars['String']['output']>;
};

export type SearchKindType = {
  exclusionReason?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  searchable: Scalars['Boolean']['output'];
};

export type SearchResultType = {
  documentOrder: Scalars['String']['output'];
  documentTotal: Scalars['Int']['output'];
  documents: Array<DocumentSearchHitType>;
  memberOrder: Scalars['String']['output'];
  memberTotal: Scalars['Int']['output'];
  members: Array<MemberSearchHitType>;
  query: Scalars['String']['output'];
};

export type SiteStatsType = {
  activeCharacters: Scalars['Int']['output'];
  activity: ActivitySummaryType;
  membersByRole: Array<CountByKeyType>;
  totalDms: Scalars['Int']['output'];
  totalMaps: Scalars['Int']['output'];
  totalMembers: Scalars['Int']['output'];
  totalQuests: Scalars['Int']['output'];
  totalRegions: Scalars['Int']['output'];
};

export type SummaryAuthoringType = {
  characterId?: Maybe<Scalars['ID']['output']>;
  complete: Scalars['Boolean']['output'];
  questIds: Array<Scalars['ID']['output']>;
};

export type SummaryDerivedType = {
  arc?: Maybe<Scalars['String']['output']>;
  authoring?: Maybe<SummaryAuthoringType>;
  dms: Array<SummaryDmType>;
  gameDate?: Maybe<GameDateType>;
  gameDay?: Maybe<Scalars['Int']['output']>;
  occurredAt?: Maybe<Scalars['DateTime']['output']>;
  players: Array<SummaryPlayerType>;
  pointcrawlNodes: Array<SummaryPointcrawlNodeType>;
  quests: Array<SummaryQuestRefType>;
  regions: Array<SummaryRegionType>;
};

export type SummaryDmType = {
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type SummaryPlayerType = {
  characterId: Scalars['ID']['output'];
  characterName: Scalars['String']['output'];
  characterShortCode: Scalars['String']['output'];
  manual: Scalars['Boolean']['output'];
  memberId: Scalars['ID']['output'];
};

export type SummaryPointcrawlNodeType = {
  id: Scalars['ID']['output'];
  mapId: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
};

export type SummaryQuestRefType = {
  id: Scalars['ID']['output'];
  shortCode: Scalars['String']['output'];
  title?: Maybe<Scalars['String']['output']>;
};

export type SummaryRegionType = {
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export enum Theme {
  Dracula = 'DRACULA',
  Ember = 'EMBER',
  Midnight = 'MIDNIGHT',
  Parchment = 'PARCHMENT',
  Vegan = 'VEGAN'
}

export type TimeAnchorInput = {
  epochDay: Scalars['Int']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  rate: Scalars['Float']['input'];
  realUtc: Scalars['DateTime']['input'];
};

export type TimeAnchorPage = {
  items: Array<TimeAnchorType>;
  total: Scalars['Int']['output'];
};

export type TimeAnchorType = {
  epochDay: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  note?: Maybe<Scalars['String']['output']>;
  rate: Scalars['Float']['output'];
  realUtc: Scalars['DateTime']['output'];
};

export enum UnlockKind {
  Achievement = 'ACHIEVEMENT',
  DmTier = 'DM_TIER'
}

export type UnlockablePage = {
  items: Array<UnlockableType>;
  total: Scalars['Int']['output'];
};

export type UnlockableType = {
  active: Scalars['Boolean']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  kind: UnlockKind;
  name: Scalars['String']['output'];
  payload: Scalars['JSON']['output'];
  unlockRule?: Maybe<Scalars['JSON']['output']>;
};

export type UpdateCharacterProfileInput = {
  backgroundText?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** Omit to keep, null to clear, or an https URL of at most 2048 characters. */
  imageUrl?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDmProfileInput = {
  acceptingPlayers: Scalars['Boolean']['input'];
  houseRules?: InputMaybe<Scalars['String']['input']>;
  philosophy?: InputMaybe<Scalars['String']['input']>;
  tableInfo?: InputMaybe<Scalars['JSON']['input']>;
  tagline?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateMyProfileInput = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  displayName: Scalars['String']['input'];
};

export type UpsertCreationCatalogEntryInput = {
  available?: Scalars['Boolean']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  introducedByRegionId?: InputMaybe<Scalars['ID']['input']>;
  kind: Scalars['String']['input'];
  name: Scalars['String']['input'];
  optionId?: InputMaybe<Scalars['ID']['input']>;
  retired?: Scalars['Boolean']['input'];
};

export type UpsertUnlockableInput = {
  active?: Scalars['Boolean']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  kind: UnlockKind;
  name: Scalars['String']['input'];
  payload: Scalars['JSON']['input'];
  unlockRule?: InputMaybe<Scalars['JSON']['input']>;
};

export type VerificationPage = {
  items: Array<VerificationType>;
  total: Scalars['Int']['output'];
};

export type VerificationType = {
  id: Scalars['ID']['output'];
  note?: Maybe<Scalars['String']['output']>;
  recordedAt: Scalars['DateTime']['output'];
  targetId: Scalars['ID']['output'];
  targetType: Scalars['String']['output'];
  verdict: Scalars['String']['output'];
  verifiedBy: Scalars['ID']['output'];
};

export enum VerificationVerdict {
  Approved = 'APPROVED',
  Rejected = 'REJECTED'
}

export type WeekActivityType = {
  messages: Scalars['Float']['output'];
  periodStart: Scalars['Date']['output'];
  reactions: Scalars['Float']['output'];
  voiceMinutes: Scalars['Float']['output'];
};
