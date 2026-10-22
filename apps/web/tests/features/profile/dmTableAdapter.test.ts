import { describe, expect, it } from 'vitest';
import { parseDmTableDocument } from '../../../src/features/profile/adapters/dmTableAdapter.js';

describe('parseDmTableDocument', () => {
  it('maps frontmatter blurb/tags', () => {
    const result = parseDmTableDocument({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'harbor-table',
      kind: 'community',
      category: 'dm_table',
      authorId: '22222222-2222-4222-8222-222222222222',
      title: 'Harbor table',
      status: 'published',
      effectiveBody: 'Body',
      frontmatter: { blurb: 'Seaside seats', tags: ['harbor'] },
      author: { handle: 'dm-kael' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.blurb).toBe('Seaside seats');
    expect(result.data?.tags).toEqual(['harbor']);
    expect(result.data?.authorHandle).toBe('dm-kael');
    expect(result.data?.isPublished).toBe(true);
  });

  it('returns null for missing document', () => {
    expect(parseDmTableDocument(null)).toEqual({ ok: true, data: null });
  });
});
