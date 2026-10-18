import { describe, expect, it } from 'vitest';
import { parseEntityLinkIndex } from '../../../src/features/editor/adapters/entityLinkIndexAdapter.js';
import { parseQuestGenreOptions } from '../../../src/features/editor/adapters/questGenreOptionsAdapter.js';

describe('entityLinkIndexAdapter', () => {
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
});

describe('questGenreOptionsAdapter', () => {
  it('parses GraphQL string array', () => {
    expect(parseQuestGenreOptions(['a', 'b'])).toEqual({ ok: true, data: ['a', 'b'] });
    expect(parseQuestGenreOptions({ options: ['x'] }).ok).toBe(false);
  });
});
