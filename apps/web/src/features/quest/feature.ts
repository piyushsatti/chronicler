import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute, shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodQuestBoard from '../../../tests/fixtures/wire/quest/board-good.json';
import goodQuestList from '../../../tests/fixtures/wire/quest/list-good.json';
import goodQuestDetail from '../../../tests/fixtures/wire/quest/detail-good.json';
import goodSummaryDocuments from '../../../tests/fixtures/wire/quest/summary-documents-good.json';

export const endpoints = {
  questSignup: (id: string) => `/v1/quests/${id}/signup`,
  questTransition: (id: string) => `/v1/quests/${id}/transition`,
  questClose: (id: string) => `/v1/quests/${id}/close`,
} as const;

export const queryKeys = {
  questBoard: ['questBoard'] as const,
  questLists: ['quests'] as const,
  questList: (
    filters: Readonly<{ status?: string; displayStatus?: string }>,
    limit: number,
    offset: number,
  ) => ['quests', { status: filters.status ?? null, displayStatus: filters.displayStatus ?? null }, limit, offset] as const,
  quest: (code: string) => ['quest', code] as const,
  questSummary: (code: string) => ['questSummary', code] as const,
};

export const graphql: FeatureGraphql = {
  QuestBoard: () => HttpResponse.json({ data: { questBoard: goodQuestBoard } }),
  QuestList: ({ variables }) => {
    const filters = variables?.filters as { status?: string; displayStatus?: string } | undefined;
    const limit = typeof variables?.limit === 'number' ? variables.limit : 50;
    const offset = typeof variables?.offset === 'number' ? variables.offset : 0;
    // Fixture display labels are frozen server output, not a second display-state rule.
    const matching = goodQuestList.items.filter((item) =>
      filters?.displayStatus
        ? item.displayStatus === filters.displayStatus
        : !filters?.status || item.status === filters.status,
    );
    return HttpResponse.json({
      data: { quests: { items: matching.slice(offset, offset + limit), total: matching.length } },
    });
  },
  Quest: () => HttpResponse.json({ data: { quest: goodQuestDetail } }),
  QuestSummaryPage: () =>
    HttpResponse.json({
      data: {
        quest: goodQuestDetail,
        documents: goodSummaryDocuments,
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.post('/v1/quests/:id/signup', () => HttpResponse.json({ ok: true })),
  http.post('/v1/quests/:id/transition', () => HttpResponse.json({ ok: true })),
  http.post('/v1/quests/:id/close', () => HttpResponse.json({ ok: true })),
];

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
