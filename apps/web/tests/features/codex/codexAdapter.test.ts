import { describe, expect, it } from 'vitest';
import {
  parseCodexDirectory,
  parseCodexEntryDetail,
  parseCodexCanonicalSlug,
} from '../../../src/features/codex/adapters/codexAdapter.js';
import bad from '../../fixtures/wire/codex/bad-missing-field.json';
import empty from '../../fixtures/wire/codex/empty-list.json';
import entryGood from '../../fixtures/wire/codex/entry-good.json';
import good from '../../fixtures/wire/codex/good.json';
import categories from '../../fixtures/wire/codex/categories-good.json';

describe('parseCodexDirectory', () => {
  it('maps directory items', () => {
    const result = parseCodexDirectory(good, categories);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0]?.title).toBe('Tree of Light');
      expect(result.data.total).toBe(2);
      expect(result.data.categories).toEqual(categories);
    }
  });

  it('rejects missing title', () => {
    const result = parseCodexDirectory(bad, categories);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });

  it('accepts empty list', () => {
    const result = parseCodexDirectory(empty, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items).toHaveLength(0);
  });

  it('uses a bounded readable excerpt without requiring one', () => {
    const result = parseCodexDirectory(
      {
        ...good,
        items: [{ ...good.items[0], effectiveBody: `First\n${'word '.repeat(100)}` }],
      },
      categories,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]?.excerpt).toHaveLength(160);
      expect(result.data.items[0]?.excerpt).not.toContain('\n');
    }
  });
});

describe('parseCodexEntryDetail', () => {
  it('maps entry document body', () => {
    const result = parseCodexEntryDetail(entryGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Tree of Light');
      expect(result.data.backlinkCount).toBe(3);
    }
  });

  it('does not render a document of another kind as a Codex entry', () => {
    expect(
      parseCodexEntryDetail({
        ...entryGood,
        document: { ...entryGood.document, kind: 'summary' },
      }),
    ).toEqual({ ok: false, failure: 'NotFound' });
  });
});

describe('parseCodexCanonicalSlug', () => {
  it('resolves only a valid Codex document reference', () => {
    expect(parseCodexCanonicalSlug(entryGood.document)).toEqual({
      ok: true,
      data: 'tree-of-light',
    });
    expect(parseCodexCanonicalSlug({ ...entryGood.document, kind: 'rule' })).toEqual({
      ok: false,
      failure: 'NotFound',
    });
  });

  it('rejects malformed IDs and missing canonical slugs at the wire boundary', () => {
    for (const wire of [
      { ...entryGood.document, id: 'not-a-uuid' },
      { ...entryGood.document, slug: '' },
      { id: entryGood.document.id, kind: 'codex_entry' },
    ]) {
      expect(parseCodexCanonicalSlug(wire)).toMatchObject({
        ok: false,
        failure: 'InvalidWire',
      });
    }
  });
});
