import { describe, expect, it } from 'vitest';
import {
  parseDocumentLoad,
  parseQuestLoad,
} from '../../../src/features/editor/adapters/editorLoad.js';
import { leDeserialize, leSerialize } from '../../../src/features/editor/LiveEditor.js';

describe('editorLoad parsers', () => {
  it('parses quest load with brief body', () => {
    const result = parseQuestLoad({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shortCode: 'Q-1',
      scheduledAt: '2026-10-15T18:00:00Z',
      durationHours: 3,
      slotsMax: 4,
      updatedAt: '2026-10-15T17:00:00Z',
      briefDocument: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: 'Salt Stair',
        version: 1,
        effectiveBody: 'Body text',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.meta.title).toBe('Salt Stair');
      expect(result.data.body).toBe('Body text');
      expect(result.data.documentId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(result.data.updatedAt).toBe('2026-10-15T17:00:00Z');
      expect(result.data.documentVersion).toBe(1);
    }
  });

  it('parses document load', () => {
    const result = parseDocumentLoad({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      slug: 'guide-1',
      kind: 'guide',
      title: 'Guide',
      version: 2,
      effectiveBody: 'Rules body',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.redirectHint).toBe('guide-1');
      expect(result.data.body).toBe('Rules body');
      expect(result.data.documentVersion).toBe(2);
    }
  });

  it('rejects bad quest wire', () => {
    expect(parseQuestLoad({ shortCode: 'Q-1' }).ok).toBe(false);
  });
});

describe('LiveEditor serialize', () => {
  it('round-trips lines', () => {
    const src = 'a\nb\nc';
    expect(leSerialize(leDeserialize(src))).toBe(src);
  });
});
