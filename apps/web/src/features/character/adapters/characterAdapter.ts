import { z } from 'zod';
import type {
  CharacterBackstoryQuery,
  CharacterQuery,
  CharacterRegionsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import CHARACTER_QUERY from './character.graphql?raw';
import CHARACTER_REGIONS_QUERY from './characterRegions.graphql?raw';
import CHARACTER_BACKSTORY_QUERY from './characterBackstory.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { characterWireSchema } from './character.wire.schema.js';

export type CharacterViewModel = {
  id: string;
  shortCode: string;
  name: string;
  status: string;
  ownerId: string | null;
  verificationStatus: string | null;
  backstoryId: string | null;
  regionId: string | null;
  regionName: string | null;
  description: string | null;
  pcxp?: number;
  daysActive?: number;
  verificationSubmittedAt?: string | null;
  ddbMirror?: NonNullable<ReturnType<typeof characterWireSchema.parse>>['ddbMirror'];
  ddbUrl: string | null;
  /** Owner-supplied https portrait (D5); null shows the initials token. */
  imageUrl: string | null;
  displayIcon: string | null;
  /** Optimistic concurrency token for submit/retire; ISO DateTime when present. */
  updatedAt: string | null;
};

export function parseCharacter(wire: unknown): AdapterResult<CharacterViewModel> {
  const parsed = characterWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      shortCode: parsed.data.shortCode,
      name: parsed.data.name,
      status: parsed.data.status,
      ownerId: parsed.data.ownerId ?? null,
      verificationStatus: parsed.data.verificationStatus ?? null,
      backstoryId: parsed.data.backstoryId ?? null,
      regionId: parsed.data.regionId ?? null,
      regionName: null,
      description: parsed.data.description ?? null,
      pcxp: parsed.data.pcxp ?? 0,
      daysActive: parsed.data.daysActive,
      verificationSubmittedAt: parsed.data.verificationSubmittedAt ?? null,
      ddbMirror: parsed.data.ddbMirror ?? null,
      ddbUrl: parsed.data.ddbUrl ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      displayIcon: parsed.data.displayIcon ?? null,
      updatedAt: parsed.data.updatedAt ?? null,
    },
  };
}

const backstoryPage = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), lore: z.string() })),
  total: z.number().int().nonnegative(),
});

export type BackstoryView = { name: string; lore: string };

const BACKSTORY_PAGE_SIZE = 100;

/**
 * Contracts expose the `backstories` list only (no `backstory(id:)`). Backstories are
 * usually drawn from the character's region, so one region-filtered page normally
 * answers; otherwise page the full list. Null means "not listed" and is returned only
 * once the list is exhausted; transport and wire failures throw an AppError.
 */
export async function loadCharacterBackstory(
  id: string,
  regionId: string | null,
): Promise<BackstoryView | null> {
  const scan = async (
    filters: { regionId: string } | null,
  ): Promise<BackstoryView | null> => {
    for (let offset = 0; ; offset += BACKSTORY_PAGE_SIZE) {
      const data = await graphqlRequest<CharacterBackstoryQuery>(
        CHARACTER_BACKSTORY_QUERY,
        { filters, limit: BACKSTORY_PAGE_SIZE, offset },
      );
      const parsed = backstoryPage.safeParse(data.backstories);
      if (!parsed.success)
        throw toAppError({ failure: 'InvalidWire' }, 'character:backstory');
      const match = parsed.data.items.find((item) => item.id === id);
      if (match) return { name: match.name, lore: match.lore };
      // An empty page also ends the scan, so a wrong total cannot loop forever.
      if (
        parsed.data.items.length === 0 ||
        offset + BACKSTORY_PAGE_SIZE >= parsed.data.total
      )
        return null;
    }
  };
  try {
    return (regionId ? await scan({ regionId }) : null) ?? (await scan(null));
  } catch (err) {
    throw toAppError(err, 'character:backstory');
  }
}

/** Contracts expose `regions` list only (no `region(id:)`); page until found or exhausted. */
const REGION_PAGE_SIZE = 100;
const REGION_MAX_PAGES = 50; // 5_000 regions scanned at most

async function loadRegionName(id: string | null): Promise<string | null> {
  if (!id) return null;
  for (let page = 0; page < REGION_MAX_PAGES; page++) {
    const data = await graphqlRequest<CharacterRegionsQuery>(
      CHARACTER_REGIONS_QUERY,
      {
        limit: REGION_PAGE_SIZE,
        offset: page * REGION_PAGE_SIZE,
      },
    );
    const match = data.regions.find((r) => r.id === id);
    if (match) return match.name;
    if (data.regions.length < REGION_PAGE_SIZE) return null;
  }
  return null;
}

export async function loadCharacter(opts: {
  id?: string;
  shortCode?: string;
}): Promise<CharacterViewModel> {
  try {
    const data = await graphqlRequest<CharacterQuery>(CHARACTER_QUERY, {
      id: opts.id ?? null,
      shortCode: opts.shortCode ?? null,
    });
    if (data.character == null) {
      throw toAppError({ failure: 'NotFound' }, 'character:load');
    }
    const draft = parseCharacter(data.character);
    if (!draft.ok) {
      throw toAppError({ failure: draft.failure }, 'character:load');
    }
    const regionName = await loadRegionName(draft.data.regionId);
    return { ...draft.data, regionName };
  } catch (err) {
    throw toAppError(err, 'character:load');
  }
}
