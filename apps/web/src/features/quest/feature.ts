import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute, shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodQuestBoard from '../../../tests/fixtures/wire/quest/board-good.json';
import goodQuestList from '../../../tests/fixtures/wire/quest/list-good.json';
import goodQuestDetail from '../../../tests/fixtures/wire/quest/detail-good.json';
import goodSummaryDocuments from '../../../tests/fixtures/wire/quest/summary-documents-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  questBoard: ['questBoard'] as const,
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

export const graphql: FeatureGraphql = {
  QuestBoard: () => HttpResponse.json({ data: { questBoard: goodQuestBoard } }),
  QuestList: ({ variables }) => {
    const filters = variables?.filters as
      { status?: string; displayStatus?: string } | undefined;
    const limit = typeof variables?.limit === 'number' ? variables.limit : 50;
    const offset = typeof variables?.offset === 'number' ? variables.offset : 0;
    // Fixture display labels are frozen server output, not a second display-state rule.
    const matching = goodQuestList.items.filter((item) =>
      filters?.displayStatus
        ? item.displayStatus === filters.displayStatus
        : !filters?.status || item.status === filters.status,
    );
    return HttpResponse.json({
      data: {
        quests: {
          items: matching.slice(offset, offset + limit),
          total: matching.length,
        },
      },
    });
  },
  QuestRegions: () =>
    HttpResponse.json({
      data: {
        regions: [{ id: '11111111-1111-4111-8111-111111111111', name: 'The Marches' }],
      },
    }),
  QuestBoardChrome: () =>
    HttpResponse.json({
      data: {
        communityDirectory: {
          total: 1,
          entries: [
            {
              memberId: '22222222-2222-4222-8222-222222222222',
              handle: 'mira',
              acceptingPlayers: true,
              isDm: true,
            },
          ],
        },
      },
    }),
  Quest: () => HttpResponse.json({ data: { quest: goodQuestDetail } }),
  QuestSummaryPage: () =>
    HttpResponse.json({
      data: {
        questSummaries: goodSummaryDocuments,
      },
    }),
  SignupForQuest: () =>
    HttpResponse.json({
      data: {
        signupForQuest: {
          questId: goodQuestDetail.id,
          characterId: '00000000-0000-4000-8000-000000000002',
          status: 'signed_up',
        },
      },
    }),
  WithdrawFromQuest: () =>
    HttpResponse.json({
      data: {
        withdrawFromQuest: {
          questId: goodQuestDetail.id,
          characterId: '00000000-0000-4000-8000-000000000002',
          status: 'withdrawn',
        },
      },
    }),
  TransitionQuestStatus: () =>
    HttpResponse.json({
      data: {
        transitionQuestStatus: {
          id: goodQuestDetail.id,
          status: 'played',
        },
      },
    }),
  CloseQuest: () =>
    HttpResponse.json({
      data: {
        closeQuest: {
          id: goodQuestDetail.id,
          status: 'closed',
        },
      },
    }),
  QuestParticipants: () =>
    HttpResponse.json({
      data: { quest: { participants: goodQuestDetail.participants } },
    }),
  QuestAuthoringAuthority: () =>
    HttpResponse.json({
      data: {
        memberProfile: {
          member: {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            roles: ['dm'],
            status: 'active',
          },
          dmProfile: { status: 'approved' },
        },
      },
    }),
  QuestArcOptions: () =>
    HttpResponse.json({ data: { questArcs: { items: [], total: 0 } } }),
  QuestMapOptions: () => HttpResponse.json({ data: { maps: [] } }),
  QuestSelectParticipants: () =>
    HttpResponse.json({ data: { selectQuestParticipants: [] } }),
  QuestAttestParticipation: () =>
    HttpResponse.json({ data: { attestQuestParticipation: [] } }),
  QuestSetPointcrawlLinks: () =>
    HttpResponse.json({ data: { setQuestPointcrawlLinks: [] } }),
  QuestSetArc: () =>
    HttpResponse.json({
      data: {
        updateQuest: {
          id: goodQuestDetail.id,
          updatedAt: goodQuestDetail.updatedAt,
          arcId: null,
        },
      },
    }),
};

export const handlers: FeatureHandlers = [];

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
