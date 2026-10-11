import { graphqlRequest } from '../../../api/graphql.js';
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
  backstoryId: string;
  backstoryName: string | null;
  regionId: string | null;
  regionName: string | null;
  description: string | null;
  ddbUrl: string | null;
  displayIcon: string | null;
};

const CHARACTER_QUERY = `
  query Character($id: ID, $shortCode: String) {
    character(id: $id, shortCode: $shortCode) {
      id
      shortCode
      name
      status
      ownerId
      verificationStatus
      backstoryId
      regionId
      description
      ddbUrl
      displayIcon
    }
  }
`;

const MY_CHARACTERS_QUERY = `
  query MyCharacters {
    myCharacters {
      items {
        id
        shortCode
        name
        status
        ownerId
        verificationStatus
        backstoryId
        regionId
        description
        ddbUrl
        displayIcon
      }
      total
    }
  }
`;

const REGION_NAME_QUERY = `
  query CharacterRegionName($id: ID!) {
    region(id: $id) {
      id
      name
    }
  }
`;

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
      backstoryId: parsed.data.backstoryId,
      backstoryName,
      regionId: parsed.data.regionId ?? null,
      regionName,
      description: parsed.data.description ?? null,
      ddbUrl: parsed.data.ddbUrl ?? null,
      displayIcon: parsed.data.displayIcon ?? null,
    },
  };
}

export async function loadBackstoryName(id: string): Promise<string | null> {
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

export async function loadRegionName(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const data = await graphqlRequest<{ region: { name?: string } | null }>(
      REGION_NAME_QUERY,
      { id },
    );
    return data.region?.name ?? null;
  } catch {
    return null;
  }
}

export async function loadCharacter(opts: {
  id?: string;
  shortCode?: string;
}): Promise<CharacterViewModel> {
  try {
    const data = await graphqlRequest<{ character: unknown | null }>(CHARACTER_QUERY, {
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
    const data = await graphqlRequest<{ myCharacters: unknown }>(MY_CHARACTERS_QUERY);
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
