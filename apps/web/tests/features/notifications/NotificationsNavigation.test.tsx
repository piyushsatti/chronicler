import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Component, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { LoginRoute } from '../../../src/chrome/LoginRoute.js';
import { NotificationsPage } from '../../../src/features/notifications/pages/NotificationsPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

const FIRST_CURSOR = '2026-10-01T12:00:00Z';
const READ_AT = '2026-10-02T12:00:00Z';

class NotificationBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? (
      <p role="alert">Notification route failed</p>
    ) : (
      this.props.children
    );
  }
}

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

function notificationsWire() {
  const requests: { limit: number; before: string | null }[] = [];
  let latestLabel = 'Latest notice';
  let acknowledgements = 0;
  server.use(
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: { limit?: number; before?: string | null };
      };
      const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
      if (name === 'MyUnreadNotificationCount') {
        return HttpResponse.json({ data: { myUnreadNotificationCount: 0 } });
      }
      if (name === 'AcknowledgeSuppressedNotifications') {
        acknowledgements += 1;
        return HttpResponse.json({
          data: {
            acknowledgeSuppressedNotifications: {
              replayed: false,
              affectedCount: 1,
            },
          },
        });
      }
      if (name === 'MarkNotificationsRead') {
        return HttpResponse.json({
          data: {
            markNotificationsRead: { replayed: false, affectedCount: 1 },
          },
        });
      }
      const variables = {
        limit: body.variables?.limit ?? 20,
        before: body.variables?.before ?? null,
      };
      requests.push(variables);
      const older = variables.before === FIRST_CURSOR;
      return HttpResponse.json({
        data: {
          myNotifications: {
            items: [
              {
                id: older
                  ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                  : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                kind: 'quest_signup',
                label: older ? 'Older notice' : latestLabel,
                title: older ? 'Earlier signup' : 'Recent signup',
                readAt: READ_AT,
              },
            ],
            hasMore: !older,
            nextBefore: older ? null : FIRST_CURSOR,
          },
        },
      });
    }),
  );
  return {
    requests,
    updateLatest: () => {
      latestLabel = 'Updated latest notice';
    },
    acknowledgementCount: () => acknowledgements,
  };
}

function renderNavigation(route = '/login') {
  // One wrapper owns one QueryClient and AuthProvider throughout client-side navigation.
  const rendered = renderWithProviders(
    <>
      <nav aria-label="Test navigation">
        <Link to="/login">Account route</Link>
        <Link to="/notifications">Inbox route</Link>
      </nav>
      <NotificationBoundary>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </NotificationBoundary>
    </>,
    { route },
  );
  return {
    ...rendered,
    user: userEvent.setup(),
    dispose: () => {
      rendered.unmount();
      rendered.queryClient.clear();
      onlineManager.setOnline(true);
    },
  };
}

function expectHealthyRoute(): void {
  expect(screen.queryByText('Notification route failed')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
}

describe('notification cache across account and inbox navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
    onlineManager.setOnline(true);
  });

  it('opens and paginates the inbox after a cached account preview, then retains the preview while offline', async () => {
    const wire = notificationsWire();
    const { user, queryClient, dispose } = renderNavigation();
    try {
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      // Pause the new observer's fetch: a fast response must not hide an incompatible cache hit.
      act(() => onlineManager.setOnline(false));
      await user.click(screen.getByRole('link', { name: 'Inbox route' }));
      expectHealthyRoute();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByText('Latest notice')).not.toBeInTheDocument();
      expect(wire.requests).toHaveLength(1);

      act(() => onlineManager.setOnline(true));
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      expect(await screen.findByText('Older notice')).toBeInTheDocument();
      expect(screen.getAllByText('Latest notice')).toHaveLength(1);
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
      expect(wire.requests).toEqual([
        { limit: 20, before: null },
        { limit: 20, before: null },
        { limit: 20, before: FIRST_CURSOR },
      ]);

      act(() => onlineManager.setOnline(false));
      await user.click(screen.getByRole('link', { name: 'Account route' }));
      expectHealthyRoute();
      expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
      expect(screen.getByText('Latest notice')).toBeInTheDocument();
      expect(screen.queryByText('Older notice')).not.toBeInTheDocument();
      expect(screen.getByText('Unread: 0')).toBeInTheDocument();
      expect(wire.requests).toHaveLength(3);
    } finally {
      dispose();
    }
  });

  it('opens the account after a paginated inbox and preserves both inbox pages on the return trip', async () => {
    notificationsWire();
    const { user, queryClient, dispose } = renderNavigation('/notifications');
    try {
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      expect(await screen.findByText('Older notice')).toBeInTheDocument();
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      act(() => onlineManager.setOnline(false));
      await user.click(screen.getByRole('link', { name: 'Account route' }));
      expectHealthyRoute();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByText('Older notice')).not.toBeInTheDocument();

      act(() => onlineManager.setOnline(true));
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      expect(screen.queryByText('Older notice')).not.toBeInTheDocument();
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      act(() => onlineManager.setOnline(false));
      await user.click(screen.getByRole('link', { name: 'Inbox route' }));
      expectHealthyRoute();
      expect(screen.getByText('Latest notice')).toBeInTheDocument();
      expect(screen.getByText('Older notice')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
    } finally {
      dispose();
    }
  });

  it('invalidates both retained cache shapes after acknowledgement and refreshes each route', async () => {
    const wire = notificationsWire();
    const { user, queryClient, dispose } = renderNavigation();
    let unsubscribe = () => {};
    try {
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Inbox route' }));
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      expect(await screen.findByText('Older notice')).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Account route' }));
      expect(await screen.findByText('Latest notice')).toBeInTheDocument();
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      const retained = queryClient.getQueryCache().findAll({
        queryKey: queryKeys.notifications,
      });
      expect(retained).toHaveLength(2);
      const invalidated = new Set<string>();
      unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'invalidate') {
          invalidated.add(event.query.queryHash);
        }
      });
      wire.updateLatest();
      await user.click(screen.getByRole('button', { name: 'Acknowledge suppressed' }));

      expect(await screen.findByText('Updated latest notice')).toBeInTheDocument();
      expect(wire.acknowledgementCount()).toBe(1);
      for (const query of retained) expect(invalidated.has(query.queryHash)).toBe(true);
      expect(screen.queryByText('Older notice')).not.toBeInTheDocument();
      expectHealthyRoute();

      await user.click(screen.getByRole('link', { name: 'Inbox route' }));
      expect(await screen.findByText('Updated latest notice')).toBeInTheDocument();
      expect(screen.getByText('Older notice')).toBeInTheDocument();
      expectHealthyRoute();
    } finally {
      unsubscribe();
      dispose();
    }
  });
});
