import { describe, expect, it } from 'vitest';
import { parseRecentChronicles } from '../../../src/features/home/adapters/homeAdapter.js';

const base = {
  visibility: 'public',
  author: { handle: 'mira' },
  publishedAt: null,
  summaryDerived: null,
};

function entry(id: string, over: Record<string, unknown> = {}) {
  return { id, slug: `slug-${id}`, title: `Entry ${id}`, ...base, ...over };
}

describe('parseRecentChronicles', () => {
  it('drops DM-only entries', () => {
    const result = parseRecentChronicles({
      items: [entry('a', { visibility: 'dm_only' }), entry('b', { visibility: 'members' })],
    });
    expect(result.ok && result.data.map((e) => e.id)).toEqual(['b']);
  });

  it('sorts newest first by session date, falling back to publish date', () => {
    const result = parseRecentChronicles({
      items: [
        entry('old', { summaryDerived: { occurredAt: '2026-01-01T00:00:00Z' } }),
        entry('published-only', { publishedAt: '2026-03-01T00:00:00Z' }),
        entry('session-wins', {
          publishedAt: '2026-01-02T00:00:00Z',
          summaryDerived: { occurredAt: '2026-05-01T00:00:00Z' },
        }),
        entry('undated'),
      ],
    });
    expect(result.ok && result.data.map((e) => e.id)).toEqual([
      'session-wins',
      'published-only',
      'old',
      'undated',
    ]);
    if (result.ok) expect(result.data[0]?.date).toBe('2026-05-01T00:00:00Z');
  });

  it('keeps wire order for equal dates and slices to the limit', () => {
    const same = { summaryDerived: { occurredAt: '2026-02-02T00:00:00Z' } };
    const result = parseRecentChronicles(
      { items: [entry('a', same), entry('b', same), entry('c', same)] },
      2,
    );
    expect(result.ok && result.data.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('maps the author handle and tolerates a missing author', () => {
    const result = parseRecentChronicles({
      items: [entry('a'), entry('b', { author: null })],
    });
    expect(result.ok && result.data.map((e) => e.authorHandle)).toEqual(['mira', null]);
  });

  it('rejects malformed wire', () => {
    expect(parseRecentChronicles({ items: [{ id: 'a' }] }).ok).toBe(false);
    expect(parseRecentChronicles(null).ok).toBe(false);
  });
});
