import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import {
  parseSearch,
  parseSearchKinds,
  loadSearch,
  snippetText,
} from '../../../src/features/search/adapters/searchAdapter.js';
import { searchHitHref } from '../../../src/features/search/searchHit.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/search/good.json';
import kinds from '../../fixtures/wire/search/kinds-good.json';

it('retains separate pages, authoritative totals, metadata and exact orders', () => {
  const result = parseSearch({ ...good, documentTotal: 45, memberTotal: 22 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.documents[0]).toMatchObject({
    kind: 'codex_entry',
    category: 'Lore',
    questShortCode: null,
  });
  expect(result.data.members[0]).toMatchObject({ handle: 'ashwin' });
  expect(result.data.documentTotal).toBe(45);
  expect(result.data.memberTotal).toBe(22);
});

it('rejects incomplete or misleading response orders and totals', () => {
  for (const wire of [
    { ...good, documentOrder: 'updated_at_desc_id_desc' },
    { ...good, memberOrder: '' },
    { ...good, documentTotal: 0 },
    { ...good, documents: [{ ...good.documents[0], category: undefined }] },
  ]) {
    expect(parseSearch(wire).ok).toBe(false);
  }
});

it('preserves null versus an explicitly empty kinds array on the wire', async () => {
  const seen: unknown[] = [];
  server.use(
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = z
        .object({
          variables: z.object({
            kinds: z.array(z.string()).nullable(),
            offset: z.number(),
            limit: z.number(),
          }),
        })
        .parse(await request.json());
      seen.push(body.variables);
      return HttpResponse.json({ data: { search: good } });
    }),
  );
  await loadSearch('tree', null, 20, 20);
  await loadSearch('tree', [], 20, 40);
  expect(seen).toEqual([
    { kinds: null, limit: 20, offset: 20 },
    { kinds: [], limit: 20, offset: 40 },
  ]);
});

describe('canonical result destinations', () => {
  const base = {
    id: 'doc',
    slug: 'an entry',
    title: 'Entry',
    snippet: 'Safe text',
    category: null,
    questShortCode: null,
  };
  it.each([
    ['codex_entry', 'Lore', null, '/codex/an%20entry'],
    ['rule', 'Ruling', null, '/rules/rulings/an%20entry'],
    ['rule', 'Guide', null, '/rules/guides/an%20entry'],
    ['summary', null, null, '/chronicles/an%20entry'],
    ['community', null, null, '/community/entries/an%20entry'],
    ['community', 'dm_table', null, '/community/dm-table/an%20entry'],
    ['quest_brief', null, 'Q-12', '/quests/Q-12'],
    ['quest_brief', null, null, null],
  ])(
    '%s resolves through the owning reader',
    (kind, category, questShortCode, href) => {
      const parsed = parseSearch({
        ...good,
        documents: [{ ...base, kind, category, questShortCode }],
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok && parsed.data.documents[0])
        expect(searchHitHref(parsed.data.documents[0])).toBe(href);
    },
  );
  it('members resolve through their exact handle', () => {
    expect(
      searchHitHref({
        memberId: 'id',
        handle: 'Case.Sensitive',
        displayName: 'Member',
        avatarUrl: null,
      }),
    ).toBe('/players/@Case.Sensitive');
  });
});

it('retains searchable kind labels and rejects the retired catalog', () => {
  const parsed = parseSearchKinds(kinds);
  expect(parsed.ok && parsed.data.map((kind) => kind.key)).toEqual([
    'codex_entry',
    'rule',
    'summary',
    'quest_brief',
    'community',
    'member',
  ]);
  expect(
    parseSearchKinds([
      { key: 'hex', label: 'Hex', searchable: true, exclusionReason: null },
    ]).ok,
  ).toBe(false);
});

describe('search snippets', () => {
  it('ends a snippet cut at the server limit on a whole word with an ellipsis', () => {
    const raw = `${'Legend says that '.repeat(14)}human`.slice(0, 240);
    expect([...raw]).toHaveLength(240);
    const shown = snippetText(raw);
    expect(raw.endsWith('that hu')).toBe(true);
    expect(shown.endsWith(' that…')).toBe(true);
  });

  it('keeps a snippet under the limit whole, without an ellipsis', () => {
    expect(snippetText('A **short** entry.')).toBe('A short entry.');
  });

  it('strips Markdown before trimming the partial word', () => {
    const raw = `## Heading\n\n${'**bold** word '.repeat(30)}`.slice(0, 240);
    const shown = snippetText(raw);
    expect(shown).not.toMatch(/[*#]/);
    expect(shown.endsWith('…')).toBe(true);
  });
});
