import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute, shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  questLists: ['quests'] as const,
  questList: (
    filters: Readonly<{ status?: string; displayStatus?: string }>,
    limit: number,
    offset: number,
  ) =>
    [
      'quests',
      { status: filters.status ?? null, displayStatus: filters.displayStatus ?? null },
      limit,
      offset,
    ] as const,
  quest: (code: string) => ['quest', code] as const,
  questSummary: (code: string) => ['questSummary', code] as const,
};

export const routes: readonly FeatureRoute[] = [
  redirectRoute('/quests/open', '/quests'),
  {
    path: '/quests',
    element: lazyElement(() =>
      import('./pages/QuestBoardPage.js').then((module) => ({
        default: module.QuestBoardPage,
      })),
    ),
  },
  {
    path: '/quests/:code/summary',
    element: lazyElement(() =>
      import('./pages/QuestSummaryPage.js').then((module) => ({
        default: module.QuestSummaryPage,
      })),
    ),
  },
  {
    path: '/quests/:code',
    element: lazyElement(() =>
      import('./pages/QuestDetailPage.js').then((module) => ({
        default: module.QuestDetailPage,
      })),
    ),
  },
  shortCodeRedirectRoute('/quests/:shortCode/redirect', '/quests'),
];
