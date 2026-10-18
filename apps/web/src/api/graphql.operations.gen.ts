/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type QuestV2FiltersInput = {
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

export type HomeWarRoomQueryVariables = Exact<{
  upcomingFrom: string;
  upcomingTo: string;
  closedSince: string;
}>;


export type HomeWarRoomQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, recentlyClosedQuests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string } }> }, communityDirectory: { total: number, entries: Array<{ memberId: string, handle: string, displayName: string, tagline: string | null, acceptingPlayers: boolean | null, isDm: boolean }> } };

export type MyNotificationsQueryVariables = Exact<{
  limit: number;
  before?: string | null | undefined;
}>;


export type MyNotificationsQuery = { myNotifications: { hasMore: boolean, nextBefore: string | null, items: Array<{ id: string, kind: string, title: string | null, summary: string | null, label: string, readAt: string | null, subjectType: string, subjectCode: string | null, createdAt: string }> } };

export type MyCharactersQueryVariables = Exact<{ [key: string]: never; }>;


export type MyCharactersQuery = { myCharacters: { total: number, items: Array<{ id: string }> } };

export type QuestBoardQueryVariables = Exact<{
  limit: number;
}>;


export type QuestBoardQuery = { questBoard: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };

export type QuestQueryVariables = Exact<{
  id?: string | null | undefined;
  shortCode?: string | null | undefined;
}>;


export type QuestQuery = { quest: { id: string, shortCode: string, status: string, scheduledAt: string, durationHours: number, slotsMax: number, filledCount: number, displayStatus: string | null, genres: Array<string>, tags: Array<string>, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null }, participants: Array<{ memberId: string, characterId: string, characterName: string, memberHandle: string, status: string }> } | null };

export type QuestListQueryVariables = Exact<{
  filters: QuestV2FiltersInput;
  limit: number;
  offset: number;
}>;


export type QuestListQuery = { quests: { total: number, items: Array<{ id: string, shortCode: string, status: string, scheduledAt: string, slotsMax: number, filledCount: number, displayStatus: string | null, dm: { handle: string, displayName: string } | null, briefDocument: { id: string, slug: string, title: string } | null, discordDelivery: { desiredRevision: number, appliedRevision: number, overallStatus: string, nextRetryAt: string | null, errorMessage: string | null } }> } };
