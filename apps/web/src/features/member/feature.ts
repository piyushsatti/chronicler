import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodMe from '../../../tests/fixtures/wire/me/good.json';

const membersMe = '/v1/members/me';
const updateMySettings = '/v1/me/settings';
const authDiscord = '/auth/discord';
const authCallback = '/auth/discord/callback';

export const endpoints = {
  membersMe,
  updateMySettings,
  authDiscord,
  authCallback,
} as const;

export const queryKeys = {
  me: ['me'] as const,
};

export const graphql: FeatureGraphql = {
  MemberMe: () => HttpResponse.json({ data: { memberMe: goodMe } }),
};

export const handlers: FeatureHandlers = [
  http.patch(updateMySettings, () => HttpResponse.json({ ok: true })),
  http.post(authCallback, async ({ request }) => {
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
        sub: 'discord-dev',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }),
    );
    return HttpResponse.json({ token: `${header}.${payload}.dev` });
  }),
];

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
    element: lazyElement(() =>
      import('./pages/MePage.js').then((module) => ({ default: module.MePage })),
    ),
  },
];
