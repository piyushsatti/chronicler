import { z } from 'zod';
import type {
  AcknowledgeSuppressedNotificationsMutation,
  MarkNotificationsReadMutation,
  MyNotificationsQuery,
  MyUnreadNotificationCountQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import NOTIFICATIONS_QUERY from './myNotifications.graphql?raw';
import UNREAD_COUNT_QUERY from './myUnreadNotificationCount.graphql?raw';
import MARK_READ_MUTATION from './markNotificationsRead.graphql?raw';
import ACK_MUTATION from './acknowledgeSuppressedNotifications.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

import {
  loadDocumentDestinations,
  subjectDestination,
  type NotificationDestination,
  type NotificationRequestSession,
} from './notificationDestinations.js';

type NotificationWriteSession = NotificationRequestSession & {
  idempotencyKey: string;
};

const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  label: z.string(),
  readAt: z.string().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  subjectType: z.string().optional().default(''),
  subjectCode: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const connectionSchema = z
  .object({
    items: z.array(notificationSchema).max(100),
    hasMore: z.boolean(),
    nextBefore: z.string().min(1).nullable().optional(),
  })
  .refine((page) => !page.hasMore || Boolean(page.nextBefore), {
    message: 'More notifications require a cursor',
  });

const unreadSchema = z.number().int().nonnegative();

const writeReceiptSchema = z.object({
  replayed: z.boolean(),
  affectedCount: z.number().int().nonnegative(),
});

export type NotificationView = {
  id: string;
  kind: string;
  label: string;
  title: string | null;
  summary: string | null;
  unread: boolean;
  readAt: string | null;
  subjectId: string | null;
  destination: NotificationDestination;
  subjectType: string;
  subjectCode: string | null;
  createdAt: string | null;
};

type NotificationPage = {
  items: NotificationView[];
  hasMore: boolean;
  nextBefore: string | null;
};

function mapItem(n: z.infer<typeof notificationSchema>): NotificationView {
  return {
    id: n.id,
    kind: n.kind,
    label: n.label,
    title: n.title ?? null,
    summary: n.summary ?? null,
    unread: n.readAt == null,
    readAt: n.readAt ?? null,
    subjectId: n.subjectId ?? null,
    destination: subjectDestination({
      subjectId: n.subjectId ?? null,
      subjectType: n.subjectType,
      subjectCode: n.subjectCode ?? null,
    }),
    subjectType: n.subjectType,
    subjectCode: n.subjectCode ?? null,
    createdAt: n.createdAt ?? null,
  };
}

export function parseNotifications(wire: unknown): AdapterResult<NotificationView[]> {
  const parsed = connectionSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items.map(mapItem) };
}

export function parseNotificationPage(wire: unknown): AdapterResult<NotificationPage> {
  const parsed = connectionSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.items.map(mapItem),
      hasMore: parsed.data.hasMore,
      nextBefore: parsed.data.nextBefore ?? null,
    },
  };
}

export function parseUnreadCount(wire: unknown): AdapterResult<number> {
  const parsed = unreadSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

export async function loadNotifications(opts: {
  limit?: number;
  before?: string | null;
  session: NotificationRequestSession;
}): Promise<NotificationPage> {
  try {
    opts.session.signal.throwIfAborted();
    const data = await graphqlRequest<MyNotificationsQuery>(
      NOTIFICATIONS_QUERY,
      { limit: opts.limit ?? 20, before: opts.before ?? null },
      {
        signal: opts.session.signal,
        headers: { Authorization: `Bearer ${opts.session.token}` },
      },
    );
    const result = parseNotificationPage(data.myNotifications);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'notifications:list');
    }
    if (result.data.hasMore && result.data.nextBefore === opts.before)
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:cursor');
    const destinations = await loadDocumentDestinations(
      result.data.items,
      opts.session,
    );
    return {
      ...result.data,
      items: result.data.items.map((item) => ({
        ...item,
        destination:
          item.subjectType === 'document' && item.subjectId
            ? (destinations.get(item.subjectId) ?? item.destination)
            : item.destination,
      })),
    };
  } catch (err) {
    throw toAppError(err, 'notifications:list');
  }
}

export async function loadUnreadCount(
  session: NotificationRequestSession,
): Promise<number> {
  try {
    session.signal.throwIfAborted();
    const data = await graphqlRequest<MyUnreadNotificationCountQuery>(
      UNREAD_COUNT_QUERY,
      undefined,
      { signal: session.signal, headers: { Authorization: `Bearer ${session.token}` } },
    );
    const result = parseUnreadCount(data.myUnreadNotificationCount);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'notifications:unread');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'notifications:unread');
  }
}

export async function acknowledgeSuppressedNotifications(
  session: NotificationWriteSession,
): Promise<z.infer<typeof writeReceiptSchema>> {
  try {
    session.signal.throwIfAborted();
    const data = await graphqlRequest<AcknowledgeSuppressedNotificationsMutation>(
      ACK_MUTATION,
      { limit: 100, meta: { idempotencyKey: session.idempotencyKey } },
      { signal: session.signal, headers: { Authorization: `Bearer ${session.token}` } },
    );
    const parsed = writeReceiptSchema.safeParse(
      data.acknowledgeSuppressedNotifications,
    );
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:ack');
    }
    return parsed.data;
  } catch (err) {
    throw toAppError(err, 'notifications:ack');
  }
}

const markReadBatchSchema = z
  .array(
    z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  )
  .max(100);

/** field-routing: markNotificationsRead → Mutation.markNotificationsRead */
export async function markNotificationsRead(
  ids: readonly string[],
  session: NotificationWriteSession,
): Promise<void> {
  try {
    const parsed = markReadBatchSchema.safeParse(ids);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:mark-read');
    }
    if (parsed.data.length === 0) return;
    const normalized = Array.from(new Set(parsed.data.map((id) => id.toLowerCase())));
    // Validated UUIDs are ASCII: even 100 distinct IDs occupy only 3,909 bytes.
    if (JSON.stringify({ ids: normalized }).length > 8192) {
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:mark-read');
    }
    session.signal.throwIfAborted();
    const data = await graphqlRequest<MarkNotificationsReadMutation>(
      MARK_READ_MUTATION,
      { ids: normalized, meta: { idempotencyKey: session.idempotencyKey } },
      {
        signal: session.signal,
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    const receipt = writeReceiptSchema.safeParse(data.markNotificationsRead);
    if (!receipt.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:mark-read');
    }
  } catch (err) {
    throw toAppError(err, 'notifications:mark-read');
  }
}
