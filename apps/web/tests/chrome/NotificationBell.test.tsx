import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../src/api/endpoints.js';
import { queryKeys } from '../../src/api/queryKeys.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { NotificationBell } from '../../src/chrome/NotificationBell.js';
import { server } from '../../src/mocks/server.js';
import { renderWithProviders } from '../test-utils.js';
import goodMe from '../fixtures/wire/me/good.json';
import { dispatchFeatureGraphql } from '../features/notifications/graphql-test-utils.js';

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

async function renderBellWithCount(count: number) {
  server.use(
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = (await request.json()) as { query?: string };
      const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
      if (name === 'MyUnreadNotificationCount') {
        return HttpResponse.json({ data: { myUnreadNotificationCount: count } });
      }
      return dispatchFeatureGraphql(body);
    }),
  );
  const rendered = renderWithProviders(<NotificationBell />);
  await waitFor(() => {
    expect(
      rendered.queryClient.getQueryData([
        ...queryKeys.notificationsUnread,
        JSON.stringify([goodMe.id, [...new Set(goodMe.roles)].sort()]),
      ]),
    ).toBe(count);
  });
  return rendered;
}

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('shows no badge and the default accessible name for zero unread', async () => {
    await renderBellWithCount(0);
    const bell = screen.getByRole('link', { name: 'Notifications' });
    expect(bell).toHaveAttribute('href', '/notifications');
    expect(bell.querySelector('[data-el="nav.notificationBell.count"]')).toBeNull();
  });

  it('shows the count badge and accessible name for two unread', async () => {
    await renderBellWithCount(2);
    const bell = screen.getByRole('link', { name: '2 unread notifications' });
    expect(bell).toHaveTextContent('2');
  });

  it('caps the badge at 99+ while retaining the exact accessible count', async () => {
    await renderBellWithCount(100);
    const bell = screen.getByRole('link', { name: '100 unread notifications' });
    expect(bell).toHaveTextContent('99+');
    expect(bell).toHaveAttribute('aria-label', '100 unread notifications');
  });
});
