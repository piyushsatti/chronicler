import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import {
  loadRulesHub,
  parseRuleDetail,
  parseRulesList,
} from '../../../src/features/rules/adapters/rulesAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import good from '../../fixtures/wire/rules/list-good.json';

const guestSession = () => ({
  token: null,
  signal: new AbortController().signal,
  assertCurrent: () => {},
});
const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...good.items[0],
    id: `6a000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `rule-${index + 1}`,
    title: `Rule ${index + 1}`,
    category: index % 3 === 0 ? 'ruling' : index % 3 === 1 ? 'guide' : null,
  }));

describe('loadRulesHub', () => {
  it('collects every rule over bounded pages, preserving category semantics and a captured bearer', async () => {
    const all = rows(205);
    const requests: unknown[] = [];
    server.use(
      graphql.query('RulesList', ({ variables, request }) => {
        requests.push({ ...variables, bearer: request.headers.get('authorization') });
        return HttpResponse.json({
          data: {
            documents: {
              items: all.slice(
                Number(variables.offset),
                Number(variables.offset) + 100,
              ),
              total: all.length,
            },
          },
        });
      }),
    );
    const result = await loadRulesHub({ ...guestSession(), token: 'captured-bearer' });
    expect(result.total).toBe(205);
    expect(result.guides.map((item) => item.id)).toEqual(
      all.filter((item) => item.category !== 'ruling').map((item) => item.id),
    );
    expect(result.rulings.map((item) => item.id)).toEqual(
      all.filter((item) => item.category === 'ruling').map((item) => item.id),
    );
    expect(requests).toEqual(
      [0, 100, 200].map((offset) => ({
        offset,
        limit: 100,
        bearer: 'Bearer captured-bearer',
      })),
    );
  });

  it('keeps a captured guest read anonymous even when an ambient account token exists', async () => {
    localStorage.setItem(TOKEN_KEY, 'ambient-bearer');
    let authorization: string | null = null;
    server.use(
      graphql.query('RulesList', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({ data: { documents: { items: [], total: 0 } } });
      }),
    );
    expect(await loadRulesHub(guestSession())).toEqual({
      guides: [],
      rulings: [],
      total: 0,
    });
    expect(authorization).toBe('');
  });

  it.each([
    'total drift',
    'duplicate identity',
    'nonadvancing page',
    'overfull page',
    'short page',
    'overrun total',
    'unrepresentable offset',
    'malformed second page',
  ])('rejects %s instead of returning a partial collection', async (failure) => {
    const all = rows(101);
    server.use(
      graphql.query('RulesList', ({ variables }) => {
        const offset = Number(variables.offset);
        const items =
          failure === 'overfull page'
            ? all
            : failure === 'short page' || failure === 'overrun total'
              ? all.slice(0, 1)
              : offset === 0
                ? all.slice(0, 100)
                : failure === 'duplicate identity'
                  ? [{ ...all[0], id: all[0].id.toUpperCase() }]
                  : failure === 'nonadvancing page'
                    ? []
                    : failure === 'malformed second page'
                      ? [{ ...all[100], id: 'not-a-uuid' }]
                      : all.slice(100);
        const total =
          failure === 'overrun total'
            ? 0
            : failure === 'unrepresentable offset'
              ? 2_147_483_648
              : failure === 'total drift' && offset > 0
                ? 102
                : 101;
        return HttpResponse.json({ data: { documents: { items, total } } });
      }),
    );
    await expect(loadRulesHub(guestSession())).rejects.toMatchObject({
      kind: 'invalid',
    });
  });

  it('reports an actual continuation error without returning the first page', async () => {
    server.use(
      graphql.query('RulesList', ({ variables }) =>
        Number(variables.offset) === 0
          ? HttpResponse.json({
              data: { documents: { items: rows(100), total: 101 } },
            })
          : HttpResponse.json({
              errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL' } }],
            }),
      ),
    );
    await expect(loadRulesHub(guestSession())).rejects.toMatchObject({
      kind: 'upstream',
    });
  });

  it('does not dispatch when already cancelled or no longer the current authority', async () => {
    const controller = new AbortController();
    controller.abort();
    let requests = 0;
    server.use(
      graphql.query('RulesList', () => {
        requests++;
        return HttpResponse.json({ data: { documents: good } });
      }),
    );
    await expect(
      loadRulesHub({ ...guestSession(), signal: controller.signal }),
    ).rejects.toBeDefined();
    await expect(
      loadRulesHub({
        ...guestSession(),
        assertCurrent: () => {
          throw new Error('stale authority');
        },
      }),
    ).rejects.toBeDefined();
    expect(requests).toBe(0);
  });

  it.each(['abort', 'authority change'])(
    'stops before a continuation after %s during the first response',
    async (change) => {
      const controller = new AbortController();
      let current = true;
      const offsets: unknown[] = [];
      server.use(
        graphql.query('RulesList', ({ variables }) => {
          offsets.push(variables.offset);
          if (change === 'abort') controller.abort();
          else current = false;
          return HttpResponse.json({
            data: { documents: { items: rows(100), total: 101 } },
          });
        }),
      );
      await expect(
        loadRulesHub({
          ...guestSession(),
          signal: controller.signal,
          assertCurrent: () => {
            if (!current) throw new Error('stale authority');
          },
        }),
      ).rejects.toBeDefined();
      expect(offsets).toEqual([0]);
    },
  );
});

describe('parseRulesList', () => {
  it('splits guides and rulings', () => {
    const result = parseRulesList(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.guides).toHaveLength(1);
      expect(result.data.rulings).toHaveLength(1);
    }
  });

  it('accepts the fields actually selected by RulesList while detail remains strict', () => {
    const selected = {
      id: good.items[0].id,
      slug: 'combat-basics',
      kind: 'rule',
      category: 'guide',
      title: 'Combat basics',
      effectiveBody: 'Turn order and actions.',
      author: { handle: 'staff' },
    };
    expect(parseRulesList({ items: [selected], total: 1 })).toMatchObject({ ok: true });
    expect(parseRuleDetail(selected)).toMatchObject({
      ok: false,
      failure: 'InvalidWire',
    });
  });

  it('bounds card previews and collapses body whitespace', () => {
    const result = parseRulesList({
      items: [{ ...good.items[0], effectiveBody: `  First\n\n${'word '.repeat(100)}` }],
      total: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const excerpt = result.data.guides[0]?.excerpt ?? '';
      expect(excerpt.length).toBeLessThanOrEqual(181);
      expect(excerpt.endsWith('word…')).toBe(true);
      expect(excerpt).not.toContain('\n');
    }
  });

  it('builds ruling previews from plain words, never raw Markdown', () => {
    const result = parseRulesList({
      items: [
        {
          ...good.items[1],
          effectiveBody:
            '## Cover\n\n- **Half cover** behind an [ally](/codex?q=ally)\n- _Full_ cover blocks `targeting`\n> Ask the DM',
        },
      ],
      total: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rulings[0]?.excerpt).toBe(
        'Half cover behind an ally Full cover blocks targeting Ask the DM',
      );
    }
  });

  it('prefers a front-matter summary for the preview', () => {
    const result = parseRulesList({
      items: [
        {
          ...good.items[1],
          effectiveBody:
            '---\ntitle: Cover\nsummary: "Allies give half cover."\n---\n- **Half**',
        },
      ],
      total: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rulings[0]?.excerpt).toBe('Allies give half cover.');
    }
  });
});
