import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodCommunity from '../../../tests/fixtures/wire/community/directory-good.json';
import goodCommunityEntry from '../../../tests/fixtures/wire/community/entry-good.json';
import goodCharacters from '../../../tests/fixtures/wire/community/characters-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  communityHub: ['communityHub'] as const,
  communityMembers: (role: string) => ['communityMembers', role] as const,
};

export const graphql: FeatureGraphql = {
  CommunityEntry: () => HttpResponse.json({ data: { document: goodCommunityEntry } }),
  CommunityEntryRelated: () => HttpResponse.json({ data: { documents: { items: [goodCommunityEntry] } } }),
  CommunityDirectory: () =>
    HttpResponse.json({ data: { communityDirectory: goodCommunity } }),
  CommunityHallOfFame: () => HttpResponse.json({ data: { document: null } }),
  CommunityCharacters: () =>
    HttpResponse.json({ data: { characters: goodCharacters } }),
};

export const handlers: FeatureHandlers = [];

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
