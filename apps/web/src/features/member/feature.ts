import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

const membersMe = '/v1/members/me';
const updateMySettings = '/v1/me/settings';
const authDiscord = '/auth/discord';
const authCallback = '/auth/discord/callback';

const mePage = lazyElement(() =>
  import('./pages/MePage.js').then((module) => ({ default: module.MePage })),
);

export const endpoints = {
  membersMe,
  updateMySettings,
  authDiscord,
  authCallback,
} as const;

export const queryKeys = {
  me: ['me'] as const,
  myPrivateNotes: (memberId: string) => ['myPrivateNotes', memberId] as const,
  currentAccess: (kind?: string, identity?: string | null) =>
    kind === undefined
      ? (['currentAccess'] as const)
      : (['currentAccess', kind, identity ?? null] as const),
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/login',
    element: lazyElement(() =>
      import('../../chrome/LoginRoute.js').then((module) => ({
        default: module.LoginRoute,
      })),
    ),
  },
  {
    path: '/auth/callback',
    element: lazyElement(() =>
      import('./pages/AuthCallbackPage.js').then((module) => ({
        default: module.AuthCallbackPage,
      })),
    ),
  },
  {
    path: '/me',
    element: mePage,
  },
  {
    path: '/me/characters',
    element: mePage,
  },
  {
    path: '/me/notes',
    element: mePage,
  },
  {
    path: '/me/history',
    element: mePage,
  },
  {
    path: '/me/summaries',
    element: mePage,
  },
];
