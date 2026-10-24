import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../src/api/endpoints.js';
import { queryKeys } from '../../src/api/queryKeys.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { NotificationBell } from '../../src/chrome/NotificationBell.js';
import { NotificationsRedirect } from '../../src/features/notifications/pages/NotificationsPage.js';
import { server } from '../../src/mocks/server.js';
import { renderWithProviders } from '../test-utils.js';
import goodMe from '../fixtures/wire/me/good.json';
import { dispatchFeatureGraphql } from '../features/notifications/graphql-test-utils.js';
import notifications from '../fixtures/wire/notifications/list-good.json';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'discord-dev',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${header}.${payload}.dev`);
}

async function renderBellWithCount(count: number, items = notifications.items) {
  const state: {
    unreadCount: number;
    items: Array<{ id: string; kind: string; title: string; summary: string; label: string; readAt: string | null; createdAt?: string }>;
    olderItems: Array<{ id: string; kind: string; title: string; summary: string; label: string; readAt: string | null; createdAt?: string }>;
    markedIds: string[][];
    acknowledgedIds: string[][];
    abortedReadRequests: number;
    markReadGate: { started: () => void; wait: Promise<void>; release: () => void } | null;
  } = { unreadCount: count, items: [...items], olderItems: [], markedIds: [], acknowledgedIds: [], abortedReadRequests: 0, markReadGate: null };
  server.use(
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = (await request.json()) as { query?: string };
      const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
      if (name === 'MyUnreadNotificationCount') {
        return HttpResponse.json({ data: { myUnreadNotificationCount: state.unreadCount } });
      }
      if (name === 'MyNotifications') {
        const parsed = body as { variables?: { before?: string | null } };
        if (parsed.variables?.before) {
          state.items = [...state.items, ...state.olderItems];
          return HttpResponse.json({ data: { myNotifications: { hasMore: false, items: state.olderItems } } });
        }
        return HttpResponse.json({ data: { myNotifications: {
          hasMore: state.olderItems.length > 0,
          ...(state.olderItems.length > 0 ? { nextBefore: '2026-10-21T12:00:00Z' } : {}),
          items: state.items,
        } } });
      }
      if (name === 'MarkNotificationsRead') {
        const parsed = body as { variables?: { ids?: string[] } };
        const ids = parsed.variables?.ids ?? [];
        state.markedIds.push(ids);
        const gate = state.markReadGate;
        if (gate) {
          gate.started();
          await gate.wait;
        }
        if (request.signal.aborted) {
          state.abortedReadRequests += 1;
          return HttpResponse.json({ data: { markNotificationsRead: { replayed: false, affectedCount: 0 } } });
        }
        state.acknowledgedIds.push(ids);
        const readAt = new Date().toISOString();
        const idSet = new Set(ids);
        state.items = state.items.map((item) => idSet.has(item.id) ? { ...item, readAt } : item);
        state.unreadCount = state.items.filter((item) => item.readAt === null).length;
        return HttpResponse.json({ data: { markNotificationsRead: { replayed: false, affectedCount: idSet.size } } });
      }
      return dispatchFeatureGraphql(body);
    }),
  );
  const rendered = renderWithProviders(
    <>
      <NotificationBell />
      <Routes>
        <Route path="/quests/Q-101" element={<p>Quest destination</p>} />
        <Route path="*" element={null} />
      </Routes>
    </>,
  );
  await waitFor(() => {
    expect(
      rendered.queryClient.getQueryData([
        ...queryKeys.notificationsUnread,
        JSON.stringify([goodMe.id, [...new Set(goodMe.roles)].sort()]),
      ]),
    ).toBe(count);
  });
  return { ...rendered, state };
}

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('shows no badge and the default accessible name for zero unread', async () => {
    await renderBellWithCount(0);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell.querySelector('[data-el="nav.notificationBell.count"]')).toBeNull();
  });

  it('shows the count badge and accessible name for two unread', async () => {
    await renderBellWithCount(2);
    const bell = screen.getByRole('button', { name: '2 unread notifications' });
    expect(bell.querySelector('[data-el="nav.notificationBell.count"]')).not.toBeNull();
  });

  it('caps the badge at 99+ while retaining the exact accessible count', async () => {
    await renderBellWithCount(100);
    const bell = screen.getByRole('button', { name: '100 unread notifications' });
    expect(bell.querySelector('[data-el="nav.notificationBell.count"]')).not.toBeNull();
    expect(bell).toHaveAttribute('aria-label', '100 unread notifications');
  });

  it('opens the dropdown, loads every cursor page before mark all, and closes with Escape', async () => {
    const user = userEvent.setup();
    const earlierItem = {
      ...notifications.items[0],
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Earlier update',
      createdAt: '2026-10-21T12:00:00Z',
    };
    const rendered = await renderBellWithCount(2);
    rendered.state.olderItems = [earlierItem];
    const bell = screen.getByRole('button', { name: '2 unread notifications' });
    await user.click(bell);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(dialog).findByText('Seat confirmed')).toBeVisible();
    expect(within(dialog).getByText('2 unread')).toBeVisible();
    expect(within(dialog).queryByText('Earlier update')).not.toBeInTheDocument();
    const markAll = within(dialog).getByRole('button', { name: 'Mark all read' });
    expect(markAll).toBeEnabled();
    await user.click(markAll);
    await waitFor(() => expect(rendered.state.markedIds).toEqual([[
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]]));
    expect(within(dialog).getByText('Earlier update')).toBeVisible();
    await waitFor(() => expect(within(dialog).getByText('0 unread')).toBeVisible());
    expect(within(dialog).getAllByText('Read')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('keeps row activation and its acknowledged mark-read write alive after closing', async () => {
    const user = userEvent.setup();
    let startRead!: () => void;
    let releaseRead!: () => void;
    const started = new Promise<void>((resolve) => { startRead = resolve; });
    const wait = new Promise<void>((resolve) => { releaseRead = resolve; });
    const item = {
      ...notifications.items[0],
      subjectType: 'quest',
      subjectCode: 'Q-101',
    };
    const rendered = await renderBellWithCount(1, [item]);
    rendered.state.markReadGate = { started: startRead, wait, release: releaseRead };

    const bell = screen.getByRole('button', { name: '1 unread notifications' });
    await user.click(bell);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    await user.click(within(dialog).getByRole('link', { name: 'Seat confirmed' }));
    await started;

    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(await screen.findByText('Quest destination')).toBeVisible();
    rendered.state.markReadGate.release();
    await waitFor(() => expect(rendered.state.acknowledgedIds).toEqual([[
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]]));
    expect(rendered.state.abortedReadRequests).toBe(0);
  });

  it('keeps a started mark-all request alive when the panel closes', async () => {
    const user = userEvent.setup();
    let startRead!: () => void;
    let releaseRead!: () => void;
    const started = new Promise<void>((resolve) => { startRead = resolve; });
    const wait = new Promise<void>((resolve) => { releaseRead = resolve; });
    const rendered = await renderBellWithCount(1);
    rendered.state.markReadGate = { started: startRead, wait, release: releaseRead };

    await user.click(screen.getByRole('button', { name: '1 unread notifications' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    await user.click(within(dialog).getByRole('button', { name: 'Mark all read' }));
    await started;
    await user.click(within(dialog).getByRole('button', { name: 'Close notifications' }));
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    rendered.state.markReadGate.release();
    await waitFor(() => expect(rendered.state.acknowledgedIds).toEqual([[
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]]));
    expect(rendered.state.abortedReadRequests).toBe(0);
  });

  it('shows the real empty state and closes on an outside press', async () => {
    const user = userEvent.setup();
    await renderBellWithCount(0, []);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    await user.click(bell);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(dialog).getByText('No notifications yet.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    await user.click(document.body);
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('redirects the legacy notification URL into the Me area', async () => {
    seedToken();
    renderWithProviders(
      <Routes>
        <Route path="/notifications" element={<NotificationsRedirect />} />
        <Route path="/me" element={<p>Me overview</p>} />
      </Routes>,
      { route: '/notifications' },
    );
    expect(await screen.findByText('Me overview')).toBeVisible();
  });
});
