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
  characterProgression:
    (merged.characterProgression as ((id: string) => string) | undefined) ??
    ((id: string) => `/v1/characters/${id}/progression`),
  pendingCharacterVerifications:
    (merged.pendingCharacterVerifications as string | undefined) ??
    '/v1/characters/pending-verifications',
  notificationsUnreadCount:
    (merged.notificationsUnreadCount as string | undefined) ??
    '/v1/me/notifications/unread-count',
  acknowledgeNotifications:
    (merged.acknowledgeNotifications as string | undefined) ??
    '/v1/me/notifications/acknowledge-suppressed',
  reconcilePersonalization:
    (merged.reconcilePersonalization as string | undefined) ??
    '/v1/me/personalization/reconcile',
} as const;
