import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodNotifications from '../../../tests/fixtures/wire/notifications/list-good.json';
import goodUnread from '../../../tests/fixtures/wire/notifications/unread-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  notifications: ['notifications'] as const,
  notificationsPreview: (limit: number) => ['notifications', 'preview', limit] as const,
  notificationsInbox: (limit: number) => ['notifications', 'inbox', limit] as const,
  notificationsUnread: ['notificationsUnread'] as const,
};

const writeReceipt = { replayed: false, affectedCount: 1 };

export const graphql: FeatureGraphql = {
  MyNotifications: () =>
    HttpResponse.json({ data: { myNotifications: goodNotifications } }),
  MyUnreadNotificationCount: () =>
    HttpResponse.json({
      data: { myUnreadNotificationCount: goodUnread.count },
    }),
  MarkNotificationsRead: () =>
    HttpResponse.json({ data: { markNotificationsRead: writeReceipt } }),
  AcknowledgeSuppressedNotifications: () =>
    HttpResponse.json({
      data: { acknowledgeSuppressedNotifications: writeReceipt },
    }),
};

export const handlers: FeatureHandlers = [];

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
