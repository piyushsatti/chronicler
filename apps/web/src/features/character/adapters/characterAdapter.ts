import type {
  CharacterQuery,
  CharacterRegionsQuery,
  MyCharacterListQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import CHARACTER_QUERY from './character.graphql?raw';
import MY_CHARACTER_LIST_QUERY from './myCharacterList.graphql?raw';
import CHARACTER_REGIONS_QUERY from './characterRegions.graphql?raw';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  backstoryWireSchema,
  characterListWireSchema,
  characterWireSchema,
} from './character.wire.schema.js';

export type CharacterViewModel = {
  id: string;
  shortCode: string;
  name: string;
  status: string;
  ownerId: string | null;
  verificationStatus: string | null;
  backstoryId: string | null;
  backstoryName: string | null;
  regionId: string | null;
  regionName: string | null;
  description: string | null;
  ddbUrl: string | null;
  displayIcon: string | null;
};

export function parseCharacter(
  wire: unknown,
  backstoryName: string | null = null,
  regionName: string | null = null,
): AdapterResult<CharacterViewModel> {
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
      backstoryName,
      regionId: parsed.data.regionId ?? null,
      regionName,
      description: parsed.data.description ?? null,
      ddbUrl: parsed.data.ddbUrl ?? null,
      displayIcon: parsed.data.displayIcon ?? null,
    },
  };
}

export async function loadBackstoryName(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const list = await restRequest<unknown[]>(rest.backstories);
    if (!Array.isArray(list)) return null;
    for (const item of list) {
      const parsed = backstoryWireSchema.safeParse(item);
      if (parsed.success && parsed.data.id === id) return parsed.data.name;
    }
    return null;
  } catch {
    return null;
  }
}

/** Contracts expose `regions` list only (no `region(id:)`); page until found or exhausted. */
const REGION_PAGE_SIZE = 200;
const REGION_MAX_PAGES = 25; // 5_000 regions scanned at most

export async function loadRegionName(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    for (let page = 0; page < REGION_MAX_PAGES; page++) {
      const data = await graphqlRequest<CharacterRegionsQuery>(CHARACTER_REGIONS_QUERY, {
        limit: REGION_PAGE_SIZE,
        offset: page * REGION_PAGE_SIZE,
      });
      const match = data.regions.find((r) => r.id === id);
      if (match) return match.name;
      if (data.regions.length < REGION_PAGE_SIZE) return null;
    }
    return null;
  } catch {
    return null;
  }
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
    const [backstoryName, regionName] = await Promise.all([
      loadBackstoryName(draft.data.backstoryId),
      loadRegionName(draft.data.regionId),
    ]);
    return { ...draft.data, backstoryName, regionName };
  } catch (err) {
    throw toAppError(err, 'character:load');
  }
}

export async function loadMyCharacters(): Promise<CharacterViewModel[]> {
  try {
    const data = await graphqlRequest<MyCharacterListQuery>(MY_CHARACTER_LIST_QUERY, {
      limit: 50,
      offset: 0,
    });
    const parsed = characterListWireSchema.safeParse(data.myCharacters);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'character:list');
    }
    return parsed.data.items.map((item) => {
      const r = parseCharacter(item);
      if (!r.ok) throw toAppError({ failure: r.failure }, 'character:list');
      return r.data;
    });
  } catch (err) {
    throw toAppError(err, 'character:list');
  }
}
