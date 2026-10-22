import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type {
  EditorSummaryQuestQuery,
  EditorSummaryQuestsQuery,
  EditorSummaryCharactersQuery,
  EditorUpsertQuestSummaryMutation,
} from '../../../api/graphql.operations.gen.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { parseDocumentMutationResult } from './editorMutations.js';
import QUEST from './editorSummaryQuest.graphql?raw';
import QUESTS from './editorSummaryQuests.graphql?raw';
import CHARACTERS from './editorSummaryCharacters.graphql?raw';
import UPSERT from './editorUpsertQuestSummary.graphql?raw';

const questSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string(),
  briefDocument: z.object({ title: z.string() }).nullable(),
});
const questPage = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(questSchema),
});
const characterPage = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), shortCode: z.string() }),
  ),
});
const questRef = (quest: z.infer<typeof questSchema>) => ({
  id: quest.id,
  shortCode: quest.shortCode,
  title: quest.briefDocument?.title ?? null,
});
export async function loadSummaryQuest(id: string) {
  const data = await graphqlRequest<EditorSummaryQuestQuery>(QUEST, { id });
  const parsed = questSchema.safeParse(data.quest);
  if (!parsed.success)
    throw toAppError(
      { failure: data.quest === null ? 'NotFound' : 'InvalidWire' },
      'editor:summary-quest',
    );
  return questRef(parsed.data);
}
export async function loadSummaryQuests(search: string, offset: number) {
  const data = await graphqlRequest<EditorSummaryQuestsQuery>(QUESTS, {
    search: search || null,
    offset,
  });
  const parsed = questPage.safeParse(data.quests);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'editor:summary-quests');
  return { ...parsed.data, items: parsed.data.items.map(questRef) };
}
export async function loadSummaryCharacters(offset: number) {
  const data = await graphqlRequest<EditorSummaryCharactersQuery>(CHARACTERS, {
    offset,
  });
  const parsed = characterPage.safeParse(data.myCharacters);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'editor:summary-characters');
  return parsed.data;
}
export type SummaryRelations = { questIds: string[]; characterId: string | null };
export async function upsertEditorSummary(
  input: SummaryRelations & {
    documentId?: string;
    expectedRevision?: number;
    title: string;
    body: string;
    visibility: string;
    frontmatter: Record<string, unknown>;
  },
  idempotencyKey: string,
) {
  const data = await graphqlRequest<EditorUpsertQuestSummaryMutation>(UPSERT, {
    input,
    meta: { idempotencyKey },
  });
  const result = parseDocumentMutationResult(data.upsertQuestSummary);
  if (!result.ok)
    throw safeAppError('Reload to check the saved summary.', 'editor:summary-save');
  return {
    id: result.data.id,
    slug: result.data.slug ?? undefined,
    version: result.data.version,
    redirectPath: `/chronicles/${encodeURIComponent(result.data.slug ?? result.data.id)}`,
  };
}
