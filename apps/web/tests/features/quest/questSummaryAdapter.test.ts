import { describe, expect, it } from 'vitest';
import { loadQuestSummaryPage } from '../../../src/features/quest/adapters/questSummaryAdapter.js';

describe('loadQuestSummaryPage', () => {
  it('maps quest header and linked documents', async () => {
    const result = await loadQuestSummaryPage('Q-101');
    expect(result.quest.shortCode).toBe('Q-101');
    expect(result.documents[0]?.title).toContain('Session 1');
  });
});
