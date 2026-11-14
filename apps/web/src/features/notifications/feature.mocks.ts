import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodNotifications from '../../../tests/fixtures/wire/notifications/list-good.json';
import goodUnread from '../../../tests/fixtures/wire/notifications/unread-good.json';

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
