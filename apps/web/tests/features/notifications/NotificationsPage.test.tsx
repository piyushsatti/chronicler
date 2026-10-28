import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphql, http, HttpResponse } from 'msw';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { NotificationsPage } from '../../../src/features/notifications/pages/NotificationsPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import notifications from '../../fixtures/wire/notifications/list-good.json';
import goodMe from '../../fixtures/wire/me/good.json';

const READ_AT = '2026-10-22T12:00:00Z';

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

describe('NotificationsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders inbox heading and notification rows', async () => {
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Quest signup')).toBeInTheDocument();
    expect(screen.getByText('Seat confirmed')).toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('filters loaded notifications by read state and counts the visible rows', async () => {
    server.use(
      graphql.query('MyNotifications', () => HttpResponse.json({ data: {
        myNotifications: { hasMore: false, items: [
          notifications.items[0],
          { ...notifications.items[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Earlier update', readAt: '2026-10-22T12:00:00Z' },
        ] },
      } })),
      graphql.mutation('MarkNotificationsRead', () => HttpResponse.json({
        errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL' } }],
      })),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    const filters = await screen.findByRole('region', { name: 'Filter notifications' });
    expect(within(filters).getByText('2 notifications')).toBeVisible();
    await userEvent.click(within(filters).getByRole('button', { name: 'Unread' }));
    expect(within(filters).getByText('1 notification')).toBeVisible();
    expect(screen.getByText('Seat confirmed')).toBeVisible();
    expect(screen.queryByText('Earlier update')).not.toBeInTheDocument();
    await userEvent.click(within(filters).getByRole('button', { name: 'All' }));
    expect(screen.getByText('Earlier update')).toBeVisible();
  });

  it('keeps the initial unread rows new after a successful acknowledgement and readback, then starts a fresh visit', async () => {
    let marked = false;
    let postMarkReadbacks = 0;
    server.use(
      graphql.query('MyNotifications', () => {
        if (marked) postMarkReadbacks += 1;
        return HttpResponse.json({ data: { myNotifications: {
          hasMore: false,
          items: [
            { ...notifications.items[0], readAt: marked ? READ_AT : null },
            { ...notifications.items[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Earlier update', readAt: READ_AT },
          ],
        } } });
      }),
      graphql.mutation('MarkNotificationsRead', () => {
        marked = true;
        return HttpResponse.json({ data: {
          markNotificationsRead: { replayed: false, affectedCount: 1 },
        } });
      }),
    );
    const user = userEvent.setup();
    const rendered = renderWithProviders(
      <>
        <Link to="/">Leave inbox</Link>
        <Link to="/notifications">Open inbox</Link>
        <Routes>
          <Route path="/" element={<p>Another page</p>} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </>,
      { route: '/notifications' },
    );
    await screen.findByText('Marked 1 notification as read.');
    await waitFor(() => {
      expect(postMarkReadbacks).toBeGreaterThanOrEqual(1);
      expect(rendered.queryClient.isFetching()).toBe(0);
    });
    const filters = screen.getByRole('region', { name: 'Filter notifications' });
    await user.click(within(filters).getByRole('button', { name: 'Unread' }));
    expect(within(filters).getByText('1 notification')).toBeVisible();
    expect(screen.getByText('Seat confirmed')).toBeVisible();
    expect(screen.getByLabelText('Quest signup: Seat confirmed, unread')).toHaveAttribute('data-unread', 'true');
    expect(screen.queryByText('Earlier update')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Leave inbox' }));
    expect(screen.getByText('Another page')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Open inbox' }));
    await screen.findByText('Seat confirmed');
    await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
    expect(screen.getByLabelText('Quest signup: Seat confirmed')).toHaveAttribute('data-unread', 'false');
    await user.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('0 notifications')).toBeVisible();
    expect(screen.getByText('No unread notifications')).toBeVisible();
  });

  it('does not add later unread notices to an initially empty visit snapshot', async () => {
    let later = false;
    server.use(
      graphql.query('MyNotifications', () => HttpResponse.json({ data: {
        myNotifications: { hasMore: false, items: later ? notifications.items : [] },
      } })),
      graphql.mutation('MarkNotificationsRead', () => HttpResponse.json({
        errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL' } }],
      })),
    );
    const rendered = renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    await screen.findByText('No notifications yet');
    await userEvent.click(screen.getByRole('button', { name: 'Unread' }));
    later = true;
    await act(async () => {
      await rendered.queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    });
    expect(screen.getByText('0 notifications')).toBeVisible();
    expect(screen.getByText('No unread notifications')).toBeVisible();
    expect(screen.queryByText('Seat confirmed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Seat confirmed')).toBeVisible();
    expect(screen.getByLabelText('Quest signup: Seat confirmed')).toHaveAttribute('data-unread', 'false');
  });

  it('excludes later pages from the initial unread snapshot while still marking them read', async () => {
    let marked = false;
    const markedIds: unknown[] = [];
    server.use(
      graphql.query('MyNotifications', ({ variables }) => HttpResponse.json({ data: {
        myNotifications: variables.before ? {
          hasMore: false,
          items: [{ ...notifications.items[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Older unread notice', readAt: marked ? READ_AT : null }],
        } : {
          hasMore: true,
          nextBefore: '2026-10-21T12:00:00Z',
          items: notifications.items.map((item) => ({ ...item, readAt: READ_AT })),
        },
      } })),
      graphql.mutation('MarkNotificationsRead', ({ variables }) => {
        markedIds.push(variables.ids);
        marked = true;
        return HttpResponse.json({ data: {
          markNotificationsRead: { replayed: false, affectedCount: 1 },
        } });
      }),
    );
    const rendered = renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    await userEvent.click(await screen.findByRole('button', { name: 'Unread' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Marked 1 notification as read.');
    await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
    expect(markedIds).toEqual([['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]);
    expect(screen.getByText('0 notifications')).toBeVisible();
    expect(screen.queryByText('Older unread notice')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Older unread notice')).toBeVisible();
  });

  it('resets the visit snapshot on account change even when notification ids overlap', async () => {
    let changed = false;
    let oldMarked = false;
    let currentMarked = false;
    server.use(
      graphql.query('MemberMe', () => HttpResponse.json({ data: {
        memberMe: { ...goodMe, id: changed ? '77000000-0000-4000-8000-000000000001' : goodMe.id },
      } })),
      graphql.query('MyNotifications', () => HttpResponse.json({ data: {
        myNotifications: { hasMore: false, items: changed ? [
          { ...notifications.items[0], title: 'Current account read notice', readAt: READ_AT },
          { ...notifications.items[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Current account unread notice', readAt: currentMarked ? READ_AT : null },
        ] : [
          { ...notifications.items[0], title: 'Old account unread notice', readAt: oldMarked ? READ_AT : null },
        ] },
      } })),
      graphql.mutation('MarkNotificationsRead', () => {
        if (changed) currentMarked = true;
        else oldMarked = true;
        return HttpResponse.json({ data: {
          markNotificationsRead: { replayed: false, affectedCount: 1 },
        } });
      }),
    );
    const rendered = renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    await screen.findByText('Marked 1 notification as read.');
    await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
    await userEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('Old account unread notice')).toBeVisible();
    changed = true;
    await act(async () => {
      await rendered.queryClient.invalidateQueries({ queryKey: queryKeys.me });
    });
    await screen.findByText('Current account unread notice');
    await waitFor(() => {
      expect(currentMarked).toBe(true);
      expect(rendered.queryClient.isFetching()).toBe(0);
    });
    expect(screen.getByText('1 notification')).toBeVisible();
    expect(screen.getByLabelText('Quest signup: Current account unread notice, unread')).toHaveAttribute('data-unread', 'true');
    expect(screen.queryByText('Old account unread notice')).not.toBeInTheDocument();
    expect(screen.queryByText('Current account read notice')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByLabelText('Quest signup: Current account read notice')).toHaveAttribute('data-unread', 'false');
  });

  it('keeps the filters and zero count above an empty inbox', async () => {
    server.use(graphql.query('MyNotifications', () => HttpResponse.json({
      data: { myNotifications: { hasMore: false, items: [] } },
    })));
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    const filters = await screen.findByRole('region', { name: 'Filter notifications' });
    expect(within(filters).getByText('0 notifications')).toBeVisible();
    expect(screen.getByText('No notifications yet')).toBeVisible();
    await userEvent.click(within(filters).getByRole('button', { name: 'Unread' }));
    expect(within(filters).getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filters).getByText('0 notifications')).toBeVisible();
    expect(screen.getByText('No unread notifications')).toBeVisible();
  });

  it('offers one settings action when the unread filter hides already-read rows', async () => {
    server.use(graphql.query('MyNotifications', () => HttpResponse.json({
      data: { myNotifications: { hasMore: false, items: notifications.items.map((item) => ({
        ...item, readAt: '2026-10-22T12:00:00Z',
      })) } },
    })));
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    await userEvent.click(await screen.findByRole('button', { name: 'Unread' }));
    expect(screen.getByText('No unread notifications')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Notification settings' })).toHaveLength(1);
  });

  it('loads the next page when the observed sentinel intersects', async () => {
    let callback: IntersectionObserverCallback | undefined;
    let options: IntersectionObserverInit | undefined;
    const observe = vi.fn();
    class TestObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '200px';
      readonly thresholds = [0];
      constructor(next: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        callback = next;
        options = init;
      }
      observe = observe;
      disconnect = vi.fn();
      takeRecords = () => [];
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', TestObserver);
    server.use(
      graphql.query('MyNotifications', ({ variables }) => HttpResponse.json({ data: {
        myNotifications: variables.before ? {
          hasMore: false,
          items: [{ ...notifications.items[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Older notice', readAt: READ_AT }],
        } : {
          hasMore: true,
          nextBefore: '2026-10-21T12:00:00Z',
          items: notifications.items.map((item) => ({ ...item, readAt: READ_AT })),
        },
      } })),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    await screen.findByText('Seat confirmed');
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    expect(options?.rootMargin).toBe('200px');
    act(() => {
      callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(await screen.findByText('Older notice')).toBeVisible();
  });

  it('does not import adapters from the page module', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/features/notifications/pages/NotificationsPage.tsx'),
      'utf8',
    );
    expect(text).not.toMatch(/adapters\//);
  });
});
