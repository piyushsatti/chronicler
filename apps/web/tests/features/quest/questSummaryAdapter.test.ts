import { describe, expect, it } from 'vitest';
import { parseQuestSummaryPage } from '../../../src/features/quest/adapters/questSummaryAdapter.js';
import goodQuestDetail from '../../fixtures/wire/quest/detail-good.json';
import goodSummaryDocuments from '../../fixtures/wire/quest/summary-documents-good.json';

describe('parseQuestSummaryPage', () => {
  it('maps quest header and linked documents', () => {
    const result = parseQuestSummaryPage({
      quest: goodQuestDetail,
      summaries: goodSummaryDocuments,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.quest.shortCode).toBe('Q-101');
      expect(result.data.documents[0]?.title).toContain('Session 1');
    }
  });
});
