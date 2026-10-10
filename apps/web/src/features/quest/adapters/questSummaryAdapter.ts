import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  parseQuestDetail,
  type QuestDetailView,
} from './questAdapter.js';

const summaryDocSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable().optional(),
  effectiveBody: z.string().nullable().optional(),
});

const summaryDocsWireSchema = z.object({
  items: z.array(summaryDocSchema),
  total: z.number().int().nonnegative(),
});

export type QuestSummaryDocumentView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  body: string | null;
};

export type QuestSummaryPageView = {
  quest: QuestDetailView;
  documents: QuestSummaryDocumentView[];
};

const SUMMARY_PAGE_QUERY = `
  query QuestSummaryPage($shortCode: String!, $search: String!) {
    quest(shortCode: $shortCode) {
      id
      shortCode
      status
      scheduledAt
      durationHours
      slotsMax
      filledCount
      displayStatus
      genres
      tags
      dm { handle displayName }
      briefDocument { id slug title }
      discordDelivery {
        desiredRevision
        appliedRevision
        overallStatus
        nextRetryAt
        errorMessage
      }
      participants {
        memberId
        characterId
        characterName
        memberHandle
        status
      }
    }
    documents(filters: { kind: "summary", search: $search }, limit: 20) {
      items {
        id
        slug
        title
        category
        effectiveBody
      }
      total
    }
  }
`;

function parseSummaryDocuments(wire: unknown): AdapterResult<QuestSummaryDocumentView[]> {
  const parsed = summaryDocsWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      category: item.category ?? null,
      body: item.effectiveBody ?? null,
    })),
  };
}

export function parseQuestSummaryPage(wire: {
  quest: unknown;
  documents: unknown;
}): AdapterResult<QuestSummaryPageView> {
  const quest = parseQuestDetail(wire.quest);
  if (!quest.ok) return quest;
  const docs = parseSummaryDocuments(wire.documents);
  if (!docs.ok) return docs;
  return { ok: true, data: { quest: quest.data, documents: docs.data } };
}

export async function loadQuestSummaryPage(
  shortCode: string,
): Promise<QuestSummaryPageView> {
  try {
    const data = await graphqlRequest<{
      quest: unknown | null;
      documents: unknown;
    }>(SUMMARY_PAGE_QUERY, { shortCode, search: shortCode });
    if (data.quest == null) {
      throw toAppError({ failure: 'NotFound' }, 'quest:summary');
    }
    const result = parseQuestSummaryPage({
      quest: data.quest,
      documents: data.documents,
    });
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'quest:summary');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:summary');
  }
}
