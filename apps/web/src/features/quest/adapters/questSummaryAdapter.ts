import { z } from 'zod';
import type { QuestSummaryPageQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import SUMMARY_PAGE_QUERY from './questSummary.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import { loadQuest, type QuestDetailView } from './questAdapter.js';

const summaryDocSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable(),
  status: z.string(),
  authorId: z.string().uuid(),
  canEditBody: z.boolean(),
  canEditMetadata: z.boolean(),
  effectiveBody: z.string().nullable(),
});
const summaryPageSchema = z.object({
  summaries: z.array(summaryDocSchema),
  totals: z.object({
    totalPcxpAwarded: z.number().int().nullable(),
    coverage: z.enum(['COMPLETE', 'LEGACY_UNKNOWN']),
  }),
});
export type QuestSummaryDocumentView = z.infer<typeof summaryDocSchema>;
export type QuestSummaryPageView = {
  quest: QuestDetailView;
  documents: QuestSummaryDocumentView[];
  totals: z.infer<typeof summaryPageSchema>['totals'];
};

export async function loadQuestSummaryPage(
  shortCode: string,
): Promise<QuestSummaryPageView> {
  try {
    const quest = await loadQuest({ shortCode });
    const documents: QuestSummaryDocumentView[] = [];
    for (;;) {
      const wire = await graphqlRequest<QuestSummaryPageQuery>(SUMMARY_PAGE_QUERY, {
        questId: quest.id,
        offset: documents.length,
      });
      const page = summaryPageSchema.parse(wire.questSummaries);
      documents.push(...page.summaries);
      if (page.summaries.length < 50) return { quest, documents, totals: page.totals };
    }
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:summary',
    );
  }
}
