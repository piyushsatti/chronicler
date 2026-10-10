import { describe, expect, it } from 'vitest';
import {
  parseCodexDirectory,
  parseCodexEntryDetail,
} from '../../../src/features/codex/adapters/codexAdapter.js';
import bad from '../../fixtures/wire/codex/bad-missing-field.json';
import empty from '../../fixtures/wire/codex/empty-list.json';
import entryGood from '../../fixtures/wire/codex/entry-good.json';
import good from '../../fixtures/wire/codex/good.json';

describe('parseCodexDirectory', () => {
  it('maps directory items', () => {
    const result = parseCodexDirectory(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.title).toBe('Tree of Light');
    }
  });

  it('rejects missing title', () => {
    const result = parseCodexDirectory(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });

  it('accepts empty list', () => {
    const result = parseCodexDirectory(empty);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(0);
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
});
