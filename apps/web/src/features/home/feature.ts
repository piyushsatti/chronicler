import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodLanes from '../../../tests/fixtures/wire/home/lanes-good.json';
import goodRecentChronicles from '../../../tests/fixtures/wire/chronicle/list-good.json';
import goodStats from '../../../tests/fixtures/wire/stats/good.json';
import goodHomeBanner from '../../../tests/fixtures/wire/admin/home-banner-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  home: ['home'] as const,
  homeLanes: ['homeLanes'] as const,
  siteStats: ['siteStats'] as const,
  homeRecentChronicles: (authenticated: boolean) =>
    ['homeRecentChronicles', authenticated] as const,
};

export const graphql: FeatureGraphql = {
  HomeWarRoom: () =>
    HttpResponse.json({
      data: {
        questBoard: goodLanes.questBoard,
        quests: goodLanes.quests,
        recentlyClosedQuests: goodLanes.recentlyClosedQuests,
        communityDirectory: goodLanes.communityDirectory,
      },
    }),
  SiteStats: () => HttpResponse.json({ data: { siteStats: goodStats } }),
  HomeRecentChronicles: () =>
    HttpResponse.json({ data: { documents: goodRecentChronicles } }),
  HomeBanner: () => HttpResponse.json({ data: { homeBanner: goodHomeBanner } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/',
    element: lazyElement(() =>
      import('./pages/HomePage.js').then((module) => ({ default: module.HomePage })),
    ),
  },
];
