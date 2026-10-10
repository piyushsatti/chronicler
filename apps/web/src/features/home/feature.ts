import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodHome from '../../../tests/fixtures/wire/home/good.json';
import goodLanes from '../../../tests/fixtures/wire/home/lanes-good.json';
import goodStats from '../../../tests/fixtures/wire/stats/good.json';

const siteStats = '/v1/stats';

export const endpoints = {
  siteStats,
} as const;

export const queryKeys = {
  home: ['home'] as const,
  homeLanes: ['homeLanes'] as const,
  siteStats: ['siteStats'] as const,
};

export const graphql: FeatureGraphql = {
  HomeBuckets: () => HttpResponse.json({ data: { home: goodHome } }),
  HomeWarRoom: () =>
    HttpResponse.json({
      data: {
        questBoard: goodLanes.questBoard,
        quests: goodLanes.quests,
        recentlyClosedQuests: goodLanes.recentlyClosedQuests,
        communityDirectory: goodLanes.communityDirectory,
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.get(siteStats, () => HttpResponse.json(goodStats)),
];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/',
    element: lazyElement(() =>
      import('./pages/HomePage.js').then((module) => ({ default: module.HomePage })),
    ),
  },
];
