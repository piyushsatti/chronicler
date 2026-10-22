import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { buildSchema, parse, validate, visit } from 'graphql';
import schemaSDL from '../../../../../packages/contracts/schema.graphql?raw';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { server } from '../../../src/mocks/server.js';
import {
  loadNotifications,
  parseNotificationPage,
} from '../../../src/features/notifications/adapters/notificationsAdapter.js';
import { loadDocumentDestinations } from '../../../src/features/notifications/adapters/notificationDestinations.js';
import documents from '../../fixtures/wire/notifications-completion/documents.json';

const session = () => ({
  token: 'captured-notification-session',
  signal: new AbortController().signal,
});
const schema = buildSchema(schemaSDL);
const requestSchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});
const notice = (
  id: string,
  subjectType: string,
  subjectId: string | null,
  subjectCode: string | null,
) => ({
  id,
  kind: 'DOCUMENT_EDITED',
  label: 'Document edited',
  title: 'Document edited',
  readAt: '2026-10-20T00:00:00Z',
  subjectType,
  subjectId,
  subjectCode,
});

describe('notification destinations', () => {
  it('resolves every canonical reader with one UUID-deduplicated metadata query and current public codes', async () => {
    const items = documents.map((document, index) =>
      notice(`notice-${index}`, 'document', document.id, document.questCode),
    );
    items.push(notice('duplicate-doc', 'document', documents[0].id, null));
    items.push(
      notice('quest', 'quest', '72000000-0000-4000-8000-000000000001', 'Q/101'),
    );
    items.push(
      notice('character', 'character', '73000000-0000-4000-8000-000000000001', 'PC 20'),
    );
    const requests: {
      query: string;
      authorization: string | null;
      variables: Record<string, unknown> | undefined;
    }[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = requestSchema.parse(await request.json());
        requests.push({
          query: body.query,
          variables: body.variables,
          authorization: request.headers.get('authorization'),
        });
        if (body.query.includes('query MyNotifications'))
          return HttpResponse.json({
            data: { myNotifications: { items, hasMore: false, nextBefore: null } },
          });
        const variables = z.record(z.string(), z.string().uuid()).parse(body.variables);
        const metadata: Record<string, unknown> = {};
        Object.values(variables).forEach((id, index) => {
          const document = documents.find((row) => row.id === id);
          if (!document) throw new Error('Unknown fixture document');
          metadata[`document${index}`] = {
            id,
            kind: document.kind,
            slug: document.slug,
            category: document.category,
          };
        });
        return HttpResponse.json({ data: metadata });
      }),
    );
    const page = await loadNotifications({ session: session() });
    expect(requests).toHaveLength(2);
    expect(requests[0].query).toMatch(/\bsubjectId\b/);
    expect(
      requests.every(
        (request) => request.authorization === 'Bearer captured-notification-session',
      ),
    ).toBe(true);
    expect(Object.values(requests[1].variables ?? {})).toEqual(
      documents.map((document) => document.id),
    );
    for (const document of documents)
      expect(requests[1].query).not.toContain(document.id);
    expect(requests[1].query).not.toMatch(/\b(title|body|effectiveBody|frontmatter)\b/);
    expect(validate(schema, parse(requests[1].query))).toEqual([]);
    documents.forEach((document, index) => {
      const destination = page.items[index].destination;
      if (document.href)
        expect(destination).toEqual({ status: 'available', href: document.href });
      else expect(destination.status).toBe('unavailable');
    });
    expect(page.items[7].destination).toEqual({
      status: 'unavailable',
      reason: 'This quest brief has no single current quest destination.',
    });
    expect(page.items.at(-2)?.destination).toEqual({
      status: 'available',
      href: '/quests/Q%2F101',
    });
    expect(page.items.at(-1)?.destination).toEqual({
      status: 'available',
      href: '/characters/PC%2020',
    });
    expect(page.items[9].destination).toEqual(page.items[0].destination);
  });

  it('does not request hidden/raw documents when a server-suppressed page contains no subjects', async () => {
    const queries: string[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = requestSchema.parse(await request.json());
        queries.push(body.query);
        return HttpResponse.json({
          data: {
            myNotifications: {
              items: [],
              hasMore: true,
              nextBefore: 'opaque-hidden-page',
            },
          },
        });
      }),
    );
    const page = await loadNotifications({ session: session() });
    expect(page).toEqual({
      items: [],
      hasMore: true,
      nextBefore: 'opaque-hidden-page',
    });
    expect(queries).toHaveLength(1);
  });

  it.each([
    {
      document0: {
        id: documents[0].id,
        kind: 'codex_entry',
        slug: 'silver-road',
        category: null,
        effectiveBody: 'PRIVATE BODY',
      },
    },
    {
      document0: {
        id: documents[1].id,
        kind: 'codex_entry',
        slug: 'silver-road',
        category: null,
      },
    },
    {},
  ])(
    'rejects extra private fields, wrong identities, or missing metadata',
    async (data) => {
      server.use(http.post(GRAPHQL_PATH, () => HttpResponse.json({ data })));
      await expect(
        loadDocumentDestinations(
          [{ subjectType: 'document', subjectId: documents[0].id, subjectCode: null }],
          session(),
        ),
      ).rejects.toMatchObject({ kind: 'invalid' });
    },
  );

  it('explains missing metadata without guessing a slug, UUID route, or document kind', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () => HttpResponse.json({ data: { document0: null } })),
    );
    const destinations = await loadDocumentDestinations(
      [{ subjectType: 'document', subjectId: documents[0].id, subjectCode: null }],
      session(),
    );
    expect(destinations.get(documents[0].id)).toEqual({
      status: 'unavailable',
      reason: 'This document is no longer available.',
    });
  });

  it('rejects missing and repeated page cursors before a looping fetch can be returned', async () => {
    expect(
      parseNotificationPage({ items: [], hasMore: true, nextBefore: null }).ok,
    ).toBe(false);
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            myNotifications: { items: [], hasMore: true, nextBefore: 'same-cursor' },
          },
        }),
      ),
    );
    await expect(
      loadNotifications({ before: 'same-cursor', session: session() }),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('caps metadata batches before transport', async () => {
    let calls = 0;
    server.use(
      http.post(GRAPHQL_PATH, () => {
        calls += 1;
        return HttpResponse.json({ data: {} });
      }),
    );
    const subjects = Array.from({ length: 101 }, (_, index) => ({
      subjectType: 'document',
      subjectCode: null,
      subjectId: `74000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    await expect(loadDocumentDestinations(subjects, session())).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(calls).toBe(0);
  });

  it('resolves a maximum page in schema-valid batches within the server complexity limit', async () => {
    const subjects = Array.from({ length: 100 }, (_, index) => ({
      subjectType: 'document',
      subjectCode: null,
      subjectId: `74000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    const batchSizes: number[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = requestSchema.parse(await request.json());
        const variables = z.record(z.string(), z.string().uuid()).parse(body.variables);
        const operation = parse(body.query);
        expect(validate(schema, operation)).toEqual([]);
        let fields = 0;
        visit(operation, {
          Field() {
            fields += 1;
          },
        });
        expect(fields).toBeLessThanOrEqual(250);
        batchSizes.push(Object.keys(variables).length);
        return HttpResponse.json({
          data: Object.fromEntries(
            Object.values(variables).map((id, index) => [
              `document${index}`,
              { id, kind: 'codex_entry', slug: `document-${id}`, category: null },
            ]),
          ),
        });
      }),
    );
    const destinations = await loadDocumentDestinations(subjects, session());
    expect(destinations.size).toBe(100);
    expect(batchSizes).toEqual([50, 50]);
  });
});
