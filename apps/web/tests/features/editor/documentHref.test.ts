import { describe, expect, it } from 'vitest';
import { documentHref, isRulingCategory } from '../../../src/utils/documentHref.js';
import {
  parseRuleDetail,
  parseRulesList,
} from '../../../src/features/rules/adapters/rulesAdapter.js';
describe('current Document reader URLs', () => {
  it.each([
    ['codex_entry', 'Lore', '/codex/a%20story'],
    ['rule', 'guide', '/rules/guides/a%20story'],
    ['rule', 'ruling', '/rules/rulings/a%20story'],
    ['summary', null, '/chronicles/a%20story'],
    ['community', 'dm_table', '/community/dm-table/a%20story'],
  ])('links %s to its real reader', (kind, category, href) => {
    expect(documentHref({ kind: kind ?? '', category, slug: 'a story' })).toBe(href);
  });
  it('requires the real Quest code for a brief link', () => {
    expect(documentHref({ kind: 'quest_brief', slug: 'brief' })).toBeNull();
    expect(
      documentHref({ kind: 'quest_brief', slug: 'brief', questShortCode: 'Q-1' }),
    ).toBe('/quests/Q-1');
  });
  it('does not invent a generic document URL for unsupported kinds', () => {
    expect(documentHref({ kind: 'retired', slug: 'story' })).toBeNull();
  });
  it('treats the ruling category case-insensitively everywhere', () => {
    expect(isRulingCategory('Ruling')).toBe(true);
    expect(isRulingCategory('ruling')).toBe(true);
    expect(isRulingCategory('guide')).toBe(false);
    expect(isRulingCategory(null)).toBe(false);
    expect(documentHref({ kind: 'rule', category: 'RULING', slug: 'x' })).toBe(
      '/rules/rulings/x',
    );
    const item = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'x',
      title: 'X',
      kind: 'rule',
      status: 'published',
      visibility: 'public',
      category: 'Ruling',
      effectiveBody: 'Body',
    };
    const list = parseRulesList({ items: [item], total: 1 });
    expect(list.ok && list.data.rulings.map((rule) => rule.slug)).toEqual(['x']);
    const detail = parseRuleDetail(item);
    expect(detail.ok && detail.data.isRuling).toBe(true);
  });
});
