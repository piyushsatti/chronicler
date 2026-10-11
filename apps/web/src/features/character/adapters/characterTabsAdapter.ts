import { z } from 'zod';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const coPlayerSchema = z.object({
  items: z
    .array(
      z.object({
        memberId: z.string().optional(),
        handle: z.string().optional(),
        displayName: z.string().optional(),
        characterName: z.string().nullable().optional(),
        sharedQuests: z.number().int().optional(),
      }),
    )
    .optional()
    .default([]),
});

const summarySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        slug: z.string().optional(),
        title: z.string(),
        questShortCode: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
});

const participationSchema = z.object({
  items: z
    .array(
      z.object({
        questId: z.string().optional(),
        questShortCode: z.string().optional(),
        questTitle: z.string().nullable().optional(),
        status: z.string().optional(),
        scheduledAt: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
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
  const parsed = coPlayerSchema.safeParse(
    Array.isArray(wire) ? { items: wire } : wire,
  );
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item, index) => ({
      key: item.memberId ?? item.handle ?? `co-${index}`,
      label:
        item.characterName ??
        item.displayName ??
        (item.handle ? `@${item.handle}` : 'Co-player'),
      sharedQuests: item.sharedQuests ?? null,
    })),
  };
}

export function parseCharacterSummaries(
  wire: unknown,
): AdapterResult<CharacterSummaryView[]> {
  const parsed = summarySchema.safeParse(
    Array.isArray(wire) ? { items: wire } : wire,
  );
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item, index) => ({
      key: item.id ?? item.slug ?? `summary-${index}`,
      title: item.title,
      href: item.slug ? `/summaries/${item.slug}` : null,
      questShortCode: item.questShortCode ?? null,
    })),
  };
}

export function parseParticipations(
  wire: unknown,
): AdapterResult<ParticipationView[]> {
  const parsed = participationSchema.safeParse(
    Array.isArray(wire) ? { items: wire } : wire,
  );
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item, index) => ({
      key: item.questId ?? item.questShortCode ?? `quest-${index}`,
      label:
        item.questTitle ??
        item.questShortCode ??
        item.questId ??
        'Quest',
      status: item.status ?? null,
      scheduledAt: item.scheduledAt ?? null,
    })),
  };
}

export async function loadCoPlayers(characterId: string): Promise<CoPlayerView[]> {
  try {
    const wire = await restRequest<unknown>(rest.characterCoPlayers(characterId));
    const result = parseCoPlayers(wire);
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
    const wire = await restRequest<unknown>(rest.characterSummaries(characterId));
    const result = parseCharacterSummaries(wire);
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
    const wire = await restRequest<unknown>(
      rest.characterParticipations(characterId),
    );
    const result = parseParticipations(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'character:participations');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:participations');
  }
}
