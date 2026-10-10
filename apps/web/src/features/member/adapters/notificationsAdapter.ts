import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  label: z.string(),
  readAt: z.string().nullable().optional(),
});

const connectionSchema = z.object({
  items: z.array(notificationSchema),
  hasMore: z.boolean(),
});

const unreadSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type NotificationView = {
  id: string;
  kind: string;
  label: string;
  title: string | null;
  summary: string | null;
  unread: boolean;
};

export function parseNotifications(
  wire: unknown,
): AdapterResult<NotificationView[]> {
  const parsed = connectionSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      title: n.title ?? null,
      summary: n.summary ?? null,
      unread: n.readAt == null,
    })),
  };
}

export function parseUnreadCount(wire: unknown): AdapterResult<number> {
  const parsed = unreadSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.count };
}

const NOTIFICATIONS_QUERY = `
  query MyNotifications($limit: Int!) {
    myNotifications(limit: $limit) {
      hasMore
      items {
        id
        kind
        title
        summary
        label
        readAt
      }
    }
  }
`;

export async function loadNotifications(): Promise<NotificationView[]> {
  try {
    const data = await graphqlRequest<{ myNotifications: unknown }>(
      NOTIFICATIONS_QUERY,
      { limit: 20 },
    );
    const result = parseNotifications(data.myNotifications);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'notifications:list');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'notifications:list');
  }
}

export async function loadUnreadCount(): Promise<number> {
  try {
    const wire = await restRequest<unknown>(rest.notificationsUnreadCount);
    const result = parseUnreadCount(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'notifications:unread');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'notifications:unread');
  }
}

export async function acknowledgeSuppressedNotifications(): Promise<void> {
  try {
    await restRequest(rest.acknowledgeNotifications, { method: 'POST' });
  } catch (err) {
    throw toAppError(err, 'notifications:ack');
  }
}
