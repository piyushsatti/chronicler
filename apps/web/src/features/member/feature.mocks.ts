import { http, HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import { endpoints } from './feature.js';
import goodMe from '../../../tests/fixtures/wire/me/good.json';

export const graphql: FeatureGraphql = {
  MemberMe: () => HttpResponse.json({ data: { memberMe: goodMe } }),
  MemberHub: () =>
    HttpResponse.json({
      data: {
        member: { id: goodMe.id, joinedAt: '2026-01-05T10:00:00Z', avatarUrl: null },
        memberActivityStats: {
          questsPlayed: 3,
          summariesAuthored: 1,
          messages: 0,
          voiceMinutes: 0,
          longestSessionHours: null,
          recentSessions: [],
        },
      },
    }),
  MemberMyUpcomingSignups: () =>
    HttpResponse.json({ data: { myQuestSignups: { total: 0, items: [] } } }),
  MemberUpcomingQuests: () =>
    HttpResponse.json({ data: { quests: { total: 0, items: [] } } }),
  MemberRoster: () =>
    HttpResponse.json({ data: { myCharacters: { total: 0, items: [] } } }),
  MemberMyPrivateNotes: () =>
    HttpResponse.json({ data: { myPrivateNotes: { body: '', updatedAt: null } } }),
  MemberSetMyPrivateNotes: (body) =>
    HttpResponse.json({
      data: {
        setMyPrivateNotes: {
          body: typeof body.variables?.body === 'string' ? body.variables.body : '',
          updatedAt: new Date().toISOString(),
        },
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.patch(endpoints.updateMySettings, () => HttpResponse.json({ ok: true })),
  http.post(endpoints.authCallback, async ({ request }) => {
    const body = (await request.json()) as { code?: string };
    if (!body.code) {
      return HttpResponse.json(
        { title: 'Bad request', status: 422, code: 'INVALID' },
        { status: 422 },
      );
    }
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({
        member_id: goodMe.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }),
    );
    return HttpResponse.json({ token: `${header}.${payload}.dev` });
  }),
];
