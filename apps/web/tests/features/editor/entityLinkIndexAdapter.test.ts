import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  loadEntityLinkIndex,
  parseEntityLinkIndex,
  searchEntityLinkFeed,
} from '../../../src/features/editor/adapters/entityLinkIndexAdapter.js';
import { parseQuestGenreOptions } from '../../../src/features/editor/adapters/questGenreOptionsAdapter.js';
import { server } from '../../../src/mocks/server.js';

describe('entityLinkIndexAdapter', () => {
  it('loads codex autocomplete beyond the first page', async () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({
      id: `entry-${index}`,
      slug: `entry-${index}`,
      title: `Entry ${index}`,
      category: 'faction',
    }));
    const requested: unknown[] = [];
    server.use(
      graphql.query('EntityLinkCodexDirectory', ({ variables }) => {
        requested.push(variables);
        const offset = Number(variables.offset ?? 0);
        const limit = Number(variables.limit ?? 50);
        return HttpResponse.json({
          data: {
            codexDirectory: {
              total: entries.length,
              items: entries.slice(offset, offset + limit),
            },
          },
        });
      }),
    );
    expect(await loadEntityLinkIndex()).toContainEqual({
      id: 'entry-50',
      label: 'Entry 50',
      kind: 'Codex',
      href: '/codex/entry-50',
    });
    expect(requested).toEqual([
      { limit: 50, offset: 0 },
      { limit: 50, offset: 50 },
    ]);
  });

  it('rejects a codex page that makes no progress', async () => {
    server.use(
      graphql.query('EntityLinkCodexDirectory', () =>
        HttpResponse.json({
          data: { codexDirectory: { total: 1, items: [] } },
        }),
      ),
    );
    await expect(loadEntityLinkIndex()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects repeated codex pages instead of a truncated index', async () => {
    server.use(
      graphql.query('EntityLinkCodexDirectory', () =>
        HttpResponse.json({
          data: {
            codexDirectory: {
              total: 2,
              items: [{ id: 'repeated', title: 'Repeated', category: 'faction' }],
            },
          },
        }),
      ),
    );
    await expect(loadEntityLinkIndex()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('maps quest codes and codex titles', () => {
    const result = parseEntityLinkIndex({
      quests: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          shortCode: 'qa-salt',
          briefDocument: { title: 'Salt' },
        },
      ],
      codex: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          slug: 'guild',
          title: 'Salt Guild',
          category: 'faction',
        },
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          slug: 'skip',
          title: 'Skipped',
          category: 'rules',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        label: 'qa-salt',
        kind: 'Quest',
        href: '/quests/qa-salt',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        label: 'Salt Guild',
        kind: 'Codex',
        href: '/codex/guild',
      },
    ]);
  });

  it('labels generic and shared member names while preserving profile identity and links', async () => {
    server.use(
      graphql.query('EntityLinkSearch', () =>
        HttpResponse.json({
          data: {
            search: {
              documents: [],
              members: [
                { memberId: 'member-1', handle: 'quiet', displayName: '' },
                { memberId: 'member-2', handle: 'mira1', displayName: 'Mira' },
                { memberId: 'member-3', handle: 'mira2', displayName: 'Mira' },
              ],
            },
          },
        }),
      ),
    );

    await expect(searchEntityLinkFeed('mira')).resolves.toEqual([
      {
        id: 'member-1',
        label: 'Unnamed member (@quiet)',
        kind: 'Profile',
        href: '/players/@quiet',
      },
      {
        id: 'member-2',
        label: 'Mira (@mira1)',
        kind: 'Profile',
        href: '/players/@mira1',
      },
      {
        id: 'member-3',
        label: 'Mira (@mira2)',
        kind: 'Profile',
        href: '/players/@mira2',
      },
    ]);
  });
});

describe('questGenreOptionsAdapter', () => {
  it('parses GraphQL string array', () => {
    expect(parseQuestGenreOptions(['a', 'b'])).toEqual({ ok: true, data: ['a', 'b'] });
    expect(parseQuestGenreOptions({ options: ['x'] }).ok).toBe(false);
  });
});
