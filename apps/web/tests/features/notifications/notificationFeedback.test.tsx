import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { NotificationsPage } from '../../../src/features/notifications/pages/NotificationsPage.js';
import { LoginNotificationsPanel } from '../../../src/features/notifications/components/LoginNotificationsPanel.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { dispatchFeatureGraphql, graphqlOperationName } from './graphql-test-utils.js';
import documents from '../../fixtures/wire/notifications-completion/documents.json';

const bodySchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});
const empty = { items: [], hasMore: false, nextBefore: null };
const genericFailure = () =>
  HttpResponse.json({
    errors: [{ message: 'private failure', extensions: { code: 'INTERNAL' } }],
  });
const readNotice = {
  id: '79000000-0000-4000-8000-000000000001',
  kind: 'QUEST_SIGNUP_CONFIRMED',
  title: 'Recovered signup',
  label: 'Quest signup confirmed',
  readAt: '2026-10-20T00:00:00Z',
  subjectType: 'quest',
  subjectId: '79000000-0000-4000-8000-000000000002',
  subjectCode: 'Q-RECOVERED',
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'fixture', exp: Date.now() / 1000 + 3600 }))}.test`,
  );
});

describe('notification retry and completion feedback', () => {
  it('advances a fully suppressed page, preserves its cursor on load-more failure, and retries visibly', async () => {
    const cursors: unknown[] = [];
    let failed = false;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        if (graphqlOperationName(body.query) !== 'MyNotifications')
          return dispatchFeatureGraphql(body);
        const before = body.variables?.before;
        cursors.push(before);
        if (!before)
          return HttpResponse.json({
            data: {
              myNotifications: {
                items: [],
                hasMore: true,
                nextBefore: 'hidden-page-cursor',
              },
            },
          });
        if (!failed) {
          failed = true;
          return genericFailure();
        }
        return HttpResponse.json({
          data: {
            myNotifications: { items: [readNotice], hasMore: false, nextBefore: null },
          },
        });
      }),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(
      await screen.findByText(
        'No visible notifications on this page. More may be available.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry load more' }));
    expect(
      await screen.findByRole('link', { name: 'Recovered signup' }),
    ).toHaveAttribute('href', '/quests/Q-RECOVERED');
    expect(cursors).toEqual([null, 'hidden-page-cursor', 'hidden-page-cursor']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers an explicit initial-load retry instead of a permanent error panel', async () => {
    let calls = 0;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        if (graphqlOperationName(body.query) !== 'MyNotifications')
          return dispatchFeatureGraphql(body);
        calls += 1;
        return calls === 1
          ? genericFailure()
          : HttpResponse.json({
              data: {
                myNotifications: {
                  items: [readNotice],
                  hasMore: false,
                  nextBefore: null,
                },
              },
            });
      }),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry notifications' }));
    expect(
      await screen.findByRole('link', { name: 'Recovered signup' }),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('shows acknowledgement failure, a retry action, and confirmed success', async () => {
    const keys: string[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        const operation = graphqlOperationName(body.query);
        if (operation === 'MyNotifications')
          return HttpResponse.json({ data: { myNotifications: empty } });
        if (operation !== 'AcknowledgeSuppressedNotifications')
          return dispatchFeatureGraphql(body);
        keys.push(
          z
            .object({ meta: z.object({ idempotencyKey: z.string() }) })
            .parse(body.variables).meta.idempotencyKey,
        );
        return keys.length === 1
          ? genericFailure()
          : HttpResponse.json({
              data: {
                acknowledgeSuppressedNotifications: {
                  replayed: true,
                  affectedCount: 3,
                },
              },
            });
      }),
    );
    renderWithProviders(<LoginNotificationsPanel enabled />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Clear alerts for removed pages' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry clearing' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Cleared 3 alerts for removed pages.',
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows each retained Document destination and an explicit orphan explanation in the real row component', async () => {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        const operation = graphqlOperationName(body.query);
        if (operation === 'MyNotifications')
          return HttpResponse.json({
            data: {
              myNotifications: {
                items: documents.map((document, index) => ({
                  id: `notice-${index}`,
                  kind: 'DOCUMENT_EDITED',
                  label: 'Document edited',
                  title: `Document ${index + 1}`,
                  readAt: '2026-10-20T00:00:00Z',
                  subjectType: 'document',
                  subjectId: document.id,
                  subjectCode: document.questCode,
                })),
                hasMore: false,
                nextBefore: null,
              },
            },
          });
        if (operation === 'NotificationDocuments')
          return HttpResponse.json({
            data: Object.fromEntries(
              documents.map((document, index) => [
                `document${index}`,
                {
                  id: document.id,
                  kind: document.kind,
                  slug: document.slug,
                  category: document.category,
                },
              ]),
            ),
          });
        return dispatchFeatureGraphql(body);
      }),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    for (const [index, document] of documents.entries()) {
      if (document.href)
        expect(
          await screen.findByRole('link', { name: `Document ${index + 1}` }),
        ).toHaveAttribute('href', document.href);
    }
    expect(
      screen.getByText('This quest brief has no single current quest destination.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This document has no supported reader.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Document 8' })).not.toBeInTheDocument();
  });

  it('reports confirmed mark-read success and updates the row immediately', async () => {
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(
      await screen.findByText('Marked 1 notification as read.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Read')).toBeInTheDocument());
  });
});
