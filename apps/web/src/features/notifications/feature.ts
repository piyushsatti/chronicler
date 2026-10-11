import { http, HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodNotifications from '../../../tests/fixtures/wire/notifications/list-good.json';
import goodUnread from '../../../tests/fixtures/wire/notifications/unread-good.json';

const notificationsUnreadCount = '/v1/me/notifications/unread-count';
const notificationsMarkRead = '/v1/me/notifications/read';
const acknowledgeNotifications = '/v1/me/notifications/acknowledge-suppressed';

export const endpoints = {
  notificationsUnreadCount,
  notificationsMarkRead,
  acknowledgeNotifications,
} as const;

export const queryKeys = {
  notifications: ['notifications'] as const,
  notificationsPreview: (limit: number) => ['notifications', 'preview', limit] as const,
  notificationsInbox: (limit: number) => ['notifications', 'inbox', limit] as const,
  notificationsUnread: ['notificationsUnread'] as const,
};

export const graphql: FeatureGraphql = {
  MyNotifications: () =>
    HttpResponse.json({ data: { myNotifications: goodNotifications } }),
};

export const handlers: FeatureHandlers = [
  http.get(notificationsUnreadCount, () => HttpResponse.json(goodUnread)),
  http.post(notificationsMarkRead, () => new HttpResponse(null, { status: 204 })),
  http.post(acknowledgeNotifications, () => HttpResponse.json({ ok: true })),
];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/notifications',
    element: lazyElement(() =>
      import('./pages/NotificationsPage.js').then((module) => ({
        default: module.NotificationsPage,
      })),
    ),
  },
];
