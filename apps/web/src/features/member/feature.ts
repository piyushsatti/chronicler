import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodMe from '../../../tests/fixtures/wire/me/good.json';
import goodNotifications from '../../../tests/fixtures/wire/notifications/list-good.json';
import goodUnread from '../../../tests/fixtures/wire/notifications/unread-good.json';

const membersMe = '/v1/members/me';
const notificationsUnreadCount = '/v1/me/notifications/unread-count';
const acknowledgeNotifications = '/v1/me/notifications/acknowledge-suppressed';
const reconcilePersonalization = '/v1/me/personalization/reconcile';
const authDiscord = '/auth/discord';
const authCallback = '/auth/discord/callback';

export const endpoints = {
  membersMe,
  notificationsUnreadCount,
  acknowledgeNotifications,
  reconcilePersonalization,
  authDiscord,
  authCallback,
} as const;

export const queryKeys = {
  me: ['me'] as const,
  notifications: ['notifications'] as const,
  notificationsUnread: ['notificationsUnread'] as const,
};

export const graphql: FeatureGraphql = {
  MyNotifications: () =>
    HttpResponse.json({ data: { myNotifications: goodNotifications } }),
};

export const handlers: FeatureHandlers = [
  http.get(membersMe, ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return HttpResponse.json(
        { title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    return HttpResponse.json(goodMe);
  }),
  http.get(notificationsUnreadCount, () => HttpResponse.json(goodUnread)),
  http.post(acknowledgeNotifications, () => HttpResponse.json({ ok: true })),
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
      import('./pages/LoginPage.js').then((module) => ({ default: module.LoginPage })),
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
