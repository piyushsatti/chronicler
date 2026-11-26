import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  notifications: ['notifications'] as const,
  notificationsPreview: (limit: number) => ['notifications', 'preview', limit] as const,
  notificationsInbox: (limit: number) => ['notifications', 'inbox', limit] as const,
  notificationsUnread: ['notificationsUnread'] as const,
  notificationsPreviewFor: (limit: number, authority: string | null) =>
    ['notifications', 'preview', limit, authority] as const,
  notificationsInboxFor: (limit: number, authority: string | null) =>
    ['notifications', 'inbox', limit, authority] as const,
  notificationsUnreadFor: (authority: string | null) =>
    ['notificationsUnread', authority] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/notifications',
    element: lazyElement(() =>
      import('./pages/NotificationsPage.js').then((module) => ({
        default: module.NotificationsRedirect,
      })),
    ),
  },
];
