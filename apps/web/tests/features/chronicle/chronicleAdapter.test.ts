import { describe, expect, it, vi } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import {
  loadChronicleList,
  parseChronicleList,
} from '../../../src/features/chronicle/adapters/chronicleAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { summaryCategoryMeta } from '../../../src/features/chronicle/summaryCategory.js';
import bad from '../../fixtures/wire/chronicle/list-bad.json';
import good from '../../fixtures/wire/chronicle/list-good.json';
import calendar from '../../fixtures/wire/chronicle/calendar-good.json';

const guestSession = () => ({
  token: null,
  signal: new AbortController().signal,
  assertCurrent: () => {},
});
const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...good.items[0],
    id: `6c000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `pagination-entry-${index + 1}`,
    title: `Pagination entry ${index + 1}`,
  }));

describe('loadChronicleList', () => {
  it.each([
    ['2026-12-31T23:59:00Z', '2026-12-31', '2027-01-01'],
    ['2028-02-29T00:01:00Z', '2028-02-29', '2028-03-01'],
  ])('requests a nonempty UTC calendar window at %s', async (now, realFrom, realTo) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const requested: unknown[] = [];
    server.use(
      graphql.query('ChronicleList', ({ variables }) => {
        requested.push(variables);
        return HttpResponse.json({ data: { documents: good, gameCalendar: calendar } });
      }),
    );
    try {
      expect((await loadChronicleList(guestSession())).total).toBe(2);
      expect(requested).toEqual([{ limit: 100, offset: 0, realFrom, realTo }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads all205 rows over bounded pages with one captured bearer and stable calendar window', async () => {
    const all = entries(205);
    const calls: {
      offset: unknown;
      limit: unknown;
      authorization: string | null;
      realFrom: unknown;
      realTo: unknown;
    }[] = [];
    server.use(
      graphql.query('ChronicleList', ({ variables, request }) => {
        calls.push({
          offset: variables.offset,
          limit: variables.limit,
          authorization: request.headers.get('authorization'),
          realFrom: variables.realFrom,
          realTo: variables.realTo,
        });
        return HttpResponse.json({
          data: {
            documents: {
              items: all.slice(
                Number(variables.offset),
                Number(variables.offset) + 100,
              ),
              total: all.length,
            },
            gameCalendar: calendar,
          },
        });
      }),
    );
    const result = await loadChronicleList({
      ...guestSession(),
      token: 'captured-test-bearer',
    });
    expect(result.total).toBe(205);
    expect(result.items.map((item) => item.id)).toEqual(all.map((item) => item.id));
    expect(
      calls.map(({ offset, limit, authorization }) => ({
        offset,
        limit,
        authorization,
      })),
    ).toEqual(
      [0, 100, 200].map((offset) => ({
        offset,
        limit: 100,
        authorization: 'Bearer captured-test-bearer',
      })),
    );
    expect(
      new Set(calls.map((call) => JSON.stringify([call.realFrom, call.realTo]))).size,
    ).toBe(1);
  });

  it('does not borrow an ambient account bearer for a captured guest read', async () => {
    localStorage.setItem(TOKEN_KEY, 'ambient-bearer');
    let authorization: string | null = null;
    server.use(
      graphql.query('ChronicleList', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({
          data: { documents: { items: [], total: 0 }, gameCalendar: calendar },
        });
      }),
    );
    expect((await loadChronicleList(guestSession())).items).toEqual([]);
    expect(authorization).toBe('');
  });

  it.each([
    'total drift',
    'duplicate identity',
    'nonadvancing page',
    'overfull page',
    'short page',
    'overrun total',
  ])('rejects %s without presenting a partial collection', async (failure) => {
    const all = entries(101);
    server.use(
      graphql.query('ChronicleList', ({ variables }) => {
        const offset = Number(variables.offset);
        const items =
          failure === 'overfull page'
            ? all
            : failure === 'short page' || failure === 'overrun total'
              ? all.slice(0, 1)
              : offset === 0
                ? all.slice(0, 100)
                : failure === 'duplicate identity'
                  ? all.slice(0, 1)
                  : failure === 'nonadvancing page'
                    ? []
                    : all.slice(100);
        const total =
          failure === 'overrun total'
            ? 0
            : failure === 'total drift' && offset > 0
              ? 102
              : 101;
        return HttpResponse.json({
          data: { documents: { items, total }, gameCalendar: calendar },
        });
      }),
    );
    await expect(loadChronicleList(guestSession())).rejects.toMatchObject({
      kind: 'invalid',
    });
  });

  it('stops before dispatch when cancelled or no longer the current authority', async () => {
    const controller = new AbortController();
    controller.abort();
    const requests: number[] = [];
    server.use(
      graphql.query('ChronicleList', () => {
        requests.push(1);
        return HttpResponse.json({ data: { documents: good, gameCalendar: calendar } });
      }),
    );
    await expect(
      loadChronicleList({ ...guestSession(), signal: controller.signal }),
    ).rejects.toBeDefined();
    await expect(
      loadChronicleList({
        ...guestSession(),
        assertCurrent: () => {
          throw new Error('stale authority');
        },
      }),
    ).rejects.toBeDefined();
    expect(requests).toEqual([]);
  });

  it('does not start another page when authority changes during the first response', async () => {
    let current = true;
    const offsets: unknown[] = [];
    server.use(
      graphql.query('ChronicleList', ({ variables }) => {
        offsets.push(variables.offset);
        current = false;
        return HttpResponse.json({
          data: {
            documents: { items: entries(100), total: 101 },
            gameCalendar: calendar,
          },
        });
      }),
    );
    await expect(
      loadChronicleList({
        ...guestSession(),
        assertCurrent: () => {
          if (!current) throw new Error('stale authority');
        },
      }),
    ).rejects.toBeDefined();
    expect(offsets).toEqual([0]);
  });
});

describe('parseChronicleList', () => {
  it('maps published summaries with derived timeline fields', () => {
    const result = parseChronicleList(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    const first = result.data.items[0];
    expect(first?.title).toBe('Vault Delve — Session recap');
    expect(first?.excerpt).toBe('The vault door finally gave way.');
    expect(first?.tags).toEqual(['delve', 'vault']);
    expect(first?.region).toBe('Dalmond');
    expect(first?.arc).toBe('Deep Roads');
    expect(first?.gameDay).toBe(142);
    expect(first?.gameDate?.eraAbbrev).toBe('AE');
    expect(first?.authorHandle).toBe('mira');
  });

  it.each(['Authored preview', '', null, 42])(
    'preserves an explicitly authored excerpt value %s over the body fallback',
    (excerpt) => {
      const result = parseChronicleList({
        items: [
          {
            ...good.items[0],
            frontmatter: { excerpt },
            effectiveBody: 'Public body preview',
          },
        ],
        total: 1,
      });
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.data.items[0]?.excerpt).toBe(
          typeof excerpt === 'string' ? excerpt : null,
        );
    },
  );

  it('uses at most160 whitespace-normalized characters of the readable body when excerpt metadata is absent', () => {
    const text = 'Public summary '.repeat(20).trim();
    const result = parseChronicleList({
      items: [
        {
          ...good.items[0],
          frontmatter: { tags: ['session'] },
          effectiveBody: ' \n\t' + text.replaceAll(' ', ' \n\t') + '  ',
        },
      ],
      total: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]?.excerpt).toBe(text.slice(0, 160));
      expect(result.data.items[0]?.excerpt).toHaveLength(160);
      expect(result.data.items[0]?.tags).toEqual(['session']);
    }
  });

  it.each([undefined, null, '', ' \n\t '])(
    'keeps no excerpt when the viewer-projected body is missing or empty: %s',
    (effectiveBody) => {
      const result = parseChronicleList({
        items: [
          {
            ...good.items[0],
            frontmatter: {},
            effectiveBody,
            body: 'Protected source must never be inferred',
          },
        ],
        total: 1,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.items[0]?.excerpt).toBeNull();
    },
  );

  it('uses only the server-projected body rather than raw source or viewer-role guesses', () => {
    const result = parseChronicleList({
      items: [
        {
          ...good.items[0],
          frontmatter: {},
          effectiveBody: 'Authorized public text',
          body: 'Authorized public text and Protected source',
        },
      ],
      total: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items[0]?.excerpt).toBe('Authorized public text');
  });

  it('rejects a malformed readable body at the wire boundary', () => {
    expect(
      parseChronicleList({
        items: [{ ...good.items[0], frontmatter: {}, effectiveBody: 42 }],
        total: 1,
      }).ok,
    ).toBe(false);
  });

  it('rejects bad wire', () => {
    expect(parseChronicleList(bad).ok).toBe(false);
  });

  it('uses the configured era even when entries use another era or no current game day exists', () => {
    const result = parseChronicleList(good, calendar.definition);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.eraAbbrev).toBe('CY');
  });

  it.each([undefined, null, {}, { era: { abbrev: 42 } }, { era: { abbrev: '' } }])(
    'keeps entries readable without a configured calendar era',
    (definition) => {
      const result = parseChronicleList(good, definition);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.eraAbbrev).toBeNull();
        expect(result.data.items).toHaveLength(2);
      }
    },
  );
});

describe('summaryCategoryMeta', () => {
  it('maps character and dm to Session and DM recap chips', () => {
    expect(summaryCategoryMeta('character').label).toBe('Session');
    expect(summaryCategoryMeta('dm').label).toBe('DM recap');
    expect(summaryCategoryMeta('session').label).toBe('Session');
    expect(summaryCategoryMeta(null).label).toBe('Entry');
  });
});
