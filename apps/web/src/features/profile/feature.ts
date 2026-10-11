import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodCommunity from '../../../tests/fixtures/wire/community/directory-good.json';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {
  ProfileCommunityDirectory: () =>
    HttpResponse.json({ data: { communityDirectory: goodCommunity } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/players/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.PlayerProfilePage,
      })),
    ),
  },
  {
    path: '/dms/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DMProfilePage,
      })),
    ),
  },
  {
    path: '/community/dm-table/:slug',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DmTableDetailPage,
      })),
    ),
  },
];
