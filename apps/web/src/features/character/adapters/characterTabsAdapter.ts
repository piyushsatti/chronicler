import { z } from 'zod';
import type {
  CharacterHistoryQuestQuery,
  CharacterSummariesQuery,
  CoPlayersQuery,
  ParticipationsByCharacterQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import CO_PLAYERS_QUERY from './coPlayers.graphql?raw';
import SUMMARIES_QUERY from './characterSummaries.graphql?raw';
import PARTICIPATIONS_QUERY from './participationsByCharacter.graphql?raw';
import HISTORY_QUEST_QUERY from './characterHistoryQuest.graphql?raw';
import { personLabels } from '../../../utils/format.js';
import { loadCharacterOwner } from './characterOwnerAdapter.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const coPlayerSchema = z.object({
  items: z
    .array(
      z.object({
        characterId: z.string().uuid(),
        memberId: z.string().uuid(),
        questCount: z.number().int(),
      }),
    )
    .optional()
    .default([]),
  total: z.number().int().optional(),
});

const summarySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string().min(1),
        title: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  total: z.number().int().optional(),
});

const participationSchema = z.object({
  items: z
    .array(
      z.object({
        questId: z.string().uuid(),
        status: z.string(),
        characterName: z.string().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  total: z.number().int().optional(),
});

export type CoPlayerView = {
  key: string;
  label: string;
  sharedQuests: number;
};

export type CharacterSummaryView = {
  key: string;
  title: string;
  href: string;
};

export type ParticipationView = {
  key: string;
  /** The quest's brief title, else its short code; never the character's own name. */
  label: string;
  href: string | null;
  status: string | null;
  scheduledAt: string | null;
};

/** The quest a participation row points at, as this viewer can read it. */
export type HistoryQuest = {
  shortCode: string;
  title: string | null;
  scheduledAt: string | null;
};

const historyQuestSchema = z
  .object({
    shortCode: z.string().min(1),
    scheduledAt: z.string().nullable().optional(),
    briefDocument: z.object({ title: z.string() }).nullable().optional(),
  })
  .nullable();

export function parseCoPlayers(wire: unknown): AdapterResult<CoPlayerView[]> {
  const parsed = coPlayerSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      key: item.memberId,
      label: item.characterId,
      sharedQuests: item.questCount,
    })),
  };
}

export function parseCharacterSummaries(
  wire: unknown,
): AdapterResult<CharacterSummaryView[]> {
  const parsed = summarySchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      key: item.id,
      title: item.title,
      href: `/summaries/${item.slug}`,
    })),
  };
}

/**
 * A participation carries only its quest id; `quests` supplies each quest's
 * title and date. A quest this viewer cannot read is named as such rather than
 * shown by id.
 */
export function parseParticipations(
  wire: unknown,
  quests: Readonly<Record<string, HistoryQuest | null>> = {},
): AdapterResult<ParticipationView[]> {
  const parsed = participationSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => {
      const quest = quests[item.questId] ?? null;
      return {
        key: item.questId,
        label: quest ? (quest.title ?? quest.shortCode) : 'Quest not available',
        href: quest ? `/quests/${encodeURIComponent(quest.shortCode)}` : null,
        status: item.status,
        scheduledAt: quest?.scheduledAt ?? null,
      };
    }),
  };
}

async function loadHistoryQuest(id: string, init?: RequestInit): Promise<HistoryQuest | null> {
  const data = await graphqlRequest<CharacterHistoryQuestQuery>(HISTORY_QUEST_QUERY, {
    id,
  }, init);
  const parsed = historyQuestSchema.safeParse(data.quest ?? null);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'character:history');
  if (!parsed.data) return null;
  return {
    shortCode: parsed.data.shortCode,
    title: parsed.data.briefDocument?.title ?? null,
    scheduledAt: parsed.data.scheduledAt ?? null,
  };
}

export async function loadCoPlayers(characterId: string): Promise<CoPlayerView[]> {
  try {
    const data = await graphqlRequest<CoPlayersQuery>(CO_PLAYERS_QUERY, {
      characterId,
      limit: 50,
      offset: 0,
    });
    const result = parseCoPlayers(data.coPlayers);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'character:co-players');
    const members = await Promise.all(result.data.map((row) => loadCharacterOwner(row.key)));
    const labels = personLabels(members, 'Player unavailable');
    return result.data.map((row, index) => ({ ...row, label: labels[index] }));
  } catch (err) {
    throw toAppError(err, 'character:co-players');
  }
}

export async function loadCharacterSummaries(
  characterId: string,
): Promise<CharacterSummaryView[]> {
  try {
    const data = await graphqlRequest<CharacterSummariesQuery>(SUMMARIES_QUERY, {
      characterId,
      limit: 50,
      offset: 0,
    });
    const result = parseCharacterSummaries(data.characterSummaries);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'character:summaries');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:summaries');
  }
}

export async function loadCharacterParticipations(
  characterId: string,
  init?: RequestInit,
): Promise<ParticipationView[]> {
  try {
    const items: z.infer<typeof participationSchema>['items'] = [];
    for (;;) {
      init?.signal?.throwIfAborted();
      const data = await graphqlRequest<ParticipationsByCharacterQuery>(
        PARTICIPATIONS_QUERY,
        { characterId, limit: 50, offset: items.length },
        init,
      );
      const page = participationSchema.safeParse(data.participationsByCharacter);
      if (!page.success) throw toAppError({ failure: 'InvalidWire' }, 'character:participations');
      items.push(...page.data.items);
      if (page.data.total === undefined || items.length >= page.data.total) break;
      if (page.data.items.length === 0) throw toAppError({ failure: 'InvalidWire' }, 'character:participations');
    }
    const ids = [...new Set(items.map((item) => item.questId))];
    const quests = Object.fromEntries(
      await Promise.all(ids.map(async (id) => [id, await loadHistoryQuest(id, init)] as const)),
    );
    const result = parseParticipations({ items }, quests);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'character:participations');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:participations');
  }
}
