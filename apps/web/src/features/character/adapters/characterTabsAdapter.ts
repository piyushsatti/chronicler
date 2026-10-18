import { z } from 'zod';
import type {
  CharacterSummariesQuery,
  CoPlayersQuery,
  ParticipationsByCharacterQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import CO_PLAYERS_QUERY from './coPlayers.graphql?raw';
import SUMMARIES_QUERY from './characterSummaries.graphql?raw';
import PARTICIPATIONS_QUERY from './participationsByCharacter.graphql?raw';
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
  sharedQuests: number | null;
};

export type CharacterSummaryView = {
  key: string;
  title: string;
  href: string | null;
  questShortCode: string | null;
};

export type ParticipationView = {
  key: string;
  label: string;
  status: string | null;
  scheduledAt: string | null;
};

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
      questShortCode: null,
    })),
  };
}

export function parseParticipations(
  wire: unknown,
): AdapterResult<ParticipationView[]> {
  const parsed = participationSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      key: item.questId,
      label: item.characterName || item.questId,
      status: item.status,
      scheduledAt: item.createdAt ?? null,
    })),
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
    if (!result.ok) throw toAppError({ failure: result.failure }, 'character:co-players');
    return result.data;
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
    if (!result.ok) throw toAppError({ failure: result.failure }, 'character:summaries');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:summaries');
  }
}

export async function loadCharacterParticipations(
  characterId: string,
): Promise<ParticipationView[]> {
  try {
    const data = await graphqlRequest<ParticipationsByCharacterQuery>(
      PARTICIPATIONS_QUERY,
      { characterId, limit: 50, offset: 0 },
    );
    const result = parseParticipations(data.participationsByCharacter);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'character:participations');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:participations');
  }
}
