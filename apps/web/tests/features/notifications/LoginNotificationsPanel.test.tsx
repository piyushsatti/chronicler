import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { LoginNotificationsPanel } from '../../../src/features/notifications/components/LoginNotificationsPanel.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

const emptyNotificationList = {
  data: {
    myNotifications: { items: [], hasMore: false, nextBefore: null },
  },
};

function renderPanel() {
  const rendered = renderWithProviders(<LoginNotificationsPanel enabled />);
  return rendered;
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

describe('LoginNotificationsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('shows the unread count separately from the current empty-list fixture', async () => {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
        if (name === 'MyUnreadNotificationCount') {
          return HttpResponse.json({ data: { myUnreadNotificationCount: 2 } });
        }
        return HttpResponse.json(emptyNotificationList);
      }),
    );

    renderPanel();

    expect(await screen.findByText('Unread: 2')).toBeInTheDocument();
    expect(screen.getByText('No notifications.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('presents a generic count error and recovers after the active query is refreshed', async () => {
    let allowRecovery = false;
    let countRequests = 0;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
        if (name === 'MyUnreadNotificationCount') {
          countRequests += 1;
          if (!allowRecovery) {
            return HttpResponse.json({
              errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
            });
          }
          return HttpResponse.json({ data: { myUnreadNotificationCount: 2 } });
        }
        return HttpResponse.json(emptyNotificationList);
      }),
    );

    const { queryClient } = renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    allowRecovery = true;
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.notificationsUnread,
      });
    });

    expect(await screen.findByText('Unread: 2')).toBeInTheDocument();
    expect(screen.getByText('No notifications.')).toBeInTheDocument();
    expect(countRequests).toBeGreaterThanOrEqual(2);
  });
});
