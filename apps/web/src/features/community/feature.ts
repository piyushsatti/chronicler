import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  communityHub: ['communityHub'] as const,
  communityMembers: (role: string) => ['communityMembers', role] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/community/entries/:slug',
    element: lazyElement(() =>
      import('./pages/CommunityEntryPage.js').then((module) => ({
        default: module.CommunityEntryPage,
      })),
    ),
  },
  {
    path: '/community',
    element: lazyElement(() =>
      import('./pages/CommunityPage.js').then((module) => ({
        default: module.CommunityPage,
      })),
    ),
  },
  {
    path: '/players',
    element: lazyElement(() =>
      import('./pages/PlayersDirectoryPage.js').then((module) => ({
        default: module.PlayersDirectoryPage,
      })),
    ),
  },
  {
    path: '/dms',
    element: lazyElement(() =>
      import('./pages/DmsDirectoryPage.js').then((module) => ({
        default: module.DmsDirectoryPage,
      })),
    ),
  },
  shortCodeRedirectRoute('/players/:shortCode/redirect', '/players'),
];
