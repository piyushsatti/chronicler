import { describe, expect, it } from 'vitest';
import {
  parseDocumentMutationResult,
  parseQuestMutationResult,
} from '../../../src/features/editor/adapters/editorMutations.js';

describe('editorMutations parsers', () => {
  it('parses quest create/update wire', () => {
    const result = parseQuestMutationResult({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shortCode: 'Q-NEW',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shortCode).toBe('Q-NEW');
    }
  });

  it('rejects bad quest wire', () => {
    expect(parseQuestMutationResult({ shortCode: 'Q-1' }).ok).toBe(false);
  });

  it('parses document wire', () => {
    const result = parseDocumentMutationResult({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'lore-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.slug).toBe('lore-1');
  });
});
