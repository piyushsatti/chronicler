import { featureEndpoints } from '../chrome/featureRegistry.js';

/** API paths for the Go /v1 surface. Same-origin in production via Vercel rewrites. */

export const GRAPHQL_PATH = '/v1/graphql';
export const HEALTH_PATH = '/health';
export const AUTH_DISCORD_PATH = '/auth/discord';
export const AUTH_CALLBACK_PATH = '/auth/discord/callback';

const merged = featureEndpoints as Record<string, unknown>;

export const rest = {
  siteStats: (merged.siteStats as string | undefined) ?? '/v1/stats',
  searchKinds: (merged.searchKinds as string | undefined) ?? '/v1/search/kinds',
  membersMe: (merged.membersMe as string | undefined) ?? '/v1/members/me',
  backstories: (merged.backstories as string | undefined) ?? '/v1/backstories',
  questSignup:
    (merged.questSignup as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/quests/${id}/signup`),
  questTransition:
    (merged.questTransition as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/quests/${id}/transition`),
  questClose:
    (merged.questClose as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/quests/${id}/close`),
  questCreate: (merged.questCreate as string | undefined) ?? '/v1/quests',
  questUpdate:
    (merged.questUpdate as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/quests/${id}`),
  questGenreOptions:
    (merged.questGenreOptions as string | undefined) ?? '/v1/quests/genre-options',
  documents: (merged.documents as string | undefined) ?? '/v1/documents',
  documentUpdate:
    (merged.documentUpdate as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/documents/${id}`),
  documentPublish:
    (merged.documentPublish as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/documents/${id}/publish`),
  documentEditPublished:
    (merged.documentEditPublished as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/documents/${id}/published`),
  documentPreviewBody:
    (merged.documentPreviewBody as string | undefined) ?? '/v1/documents/preview-body',
  questDiscordSync:
    (merged.questDiscordSync as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/quests/${id}/discord/sync`),
  discordDeliveryMode:
    (merged.discordDeliveryMode as string | undefined) ??
    '/v1/config/discord-delivery-mode',
  updateRegion:
    (merged.updateRegion as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/regions/${id}`),
  timeAnchors: (merged.timeAnchors as string | undefined) ?? '/v1/time/anchors',
  timeAnchorUpdate:
    (merged.timeAnchorUpdate as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/time/anchors/${id}`),
  gameCalendar: (merged.gameCalendar as string | undefined) ?? '/v1/calendar',
  setMemberRolesBatch:
    (merged.setMemberRolesBatch as string | undefined) ?? '/v1/members/roles:batch',
  characterProgression:
    (merged.characterProgression as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/progression`),
  characterLogs:
    (merged.characterLogs as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/logs`),
  characterSummaries:
    (merged.characterSummaries as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/summaries`),
  characterCoPlayers:
    (merged.characterCoPlayers as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/co-players`),
  characterParticipations:
    (merged.characterParticipations as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/participations`),
  decideCharacterVerification:
    (merged.decideCharacterVerification as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/decide-verification`),
  decideDmProfileVerification:
    (merged.decideDmProfileVerification as ((memberId: string) => string) | undefined) ??
    ((memberId: string) => `/v1/dm-profiles/${memberId}/decide`),
  setMemberRoles:
    (merged.setMemberRoles as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/members/${id}/roles`),
  homeBanner:
    (merged.homeBanner as string | undefined) ?? '/v1/site-settings/home-banner',
  pendingCharacterVerifications:
    (merged.pendingCharacterVerifications as string | undefined) ??
    '/v1/characters/pending-verifications',
  notificationsUnreadCount:
    (merged.notificationsUnreadCount as string | undefined) ??
    '/v1/me/notifications/unread-count',
  notificationsMarkRead:
    (merged.notificationsMarkRead as string | undefined) ??
    '/v1/me/notifications/read',
  acknowledgeNotifications:
    (merged.acknowledgeNotifications as string | undefined) ??
    '/v1/me/notifications/acknowledge-suppressed',
  createRegion: (merged.createRegion as string | undefined) ?? '/v1/regions',
  creationCatalog:
    (merged.creationCatalog as string | undefined) ?? '/v1/creation-catalog',
  upsertCreationCatalog:
    (merged.upsertCreationCatalog as string | undefined) ??
    '/v1/admin/creation-catalog',
  createBackstory:
    (merged.createBackstory as string | undefined) ?? '/v1/admin/backstories',
  updateBackstory:
    (merged.updateBackstory as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/admin/backstories/${id}`),
  characterProfile:
    (merged.characterProfile as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/profile`),
  characterSubmitVerification:
    (merged.characterSubmitVerification as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/submit-verification`),
  characterRetire:
    (merged.characterRetire as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/retire`),
} as const;
