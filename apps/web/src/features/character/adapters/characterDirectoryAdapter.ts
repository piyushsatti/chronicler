import { z } from 'zod';
import type {
  CharacterDirectoryQuery,
  CharacterCreationCatalogQuery,
  BackstoriesQuery,
  CharacterRegionsQuery,
  CreateCharacterMutation,
  CreateCharacterMutationVariables,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { characterListWireSchema } from './character.wire.schema.js';
import { parseCharacter } from './characterAdapter.js';
import DIRECTORY from './characterDirectory.graphql?raw';
import CATALOG from './characterCreationCatalog.graphql?raw';
import BACKSTORIES from './backstories.graphql?raw';
import REGIONS from './characterRegions.graphql?raw';
import CREATE from './createCharacter.graphql?raw';

export type CharacterDirectoryFilters = {
  namePrefix?: string;
  status?: string;
  regionId?: string;
  ownerId?: string;
};
const namedOption = z.object({ id: z.string().uuid(), name: z.string().min(1) });
const optionPage = z.object({
  items: z.array(namedOption),
  total: z.number().int().nonnegative(),
});
const catalogPage = z.object({
  items: z.array(
    namedOption.extend({
      kind: z.string(),
      available: z.boolean(),
      retired: z.boolean(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type CreationOptions = {
  backstories: z.infer<typeof namedOption>[];
  catalog: z.infer<typeof catalogPage>['items'];
  regions: z.infer<typeof namedOption>[];
};
export type NewCharacterFields = CreateCharacterMutationVariables['input'];

export async function loadCharacterDirectory(
  filters: CharacterDirectoryFilters,
  limit: number,
  offset: number,
) {
  const data = await graphqlRequest<CharacterDirectoryQuery>(DIRECTORY, {
    filters,
    limit,
    offset,
  });
  const parsed = characterListWireSchema.safeParse(data.characters);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'character:directory');
  const items = parsed.data.items.map((item) => {
    const result = parseCharacter(item);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'character:directory');
    return result.data;
  });
  return { items, total: parsed.data.total };
}

async function allOptions<T>(
  load: (offset: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = [];
  for (;;) {
    const page = await load(items.length);
    items.push(...page.items);
    if (items.length >= page.total) return items;
    if (page.items.length === 0)
      throw toAppError({ failure: 'InvalidWire' }, 'character:options');
  }
}
export async function loadCreationOptions(regionId: string): Promise<CreationOptions> {
  const [backstories, catalog, regions] = await Promise.all([
    allOptions(async (offset) => {
      const data = await graphqlRequest<BackstoriesQuery>(BACKSTORIES, {
        limit: 100,
        offset,
      });
      return optionPage.parse(data.backstories);
    }),
    allOptions(async (offset) => {
      const data = await graphqlRequest<CharacterCreationCatalogQuery>(CATALOG, {
        filters: { regionId: regionId || null },
        limit: 100,
        offset,
      });
      return catalogPage.parse(data.creationCatalog);
    }),
    (async () => {
      const items: z.infer<typeof namedOption>[] = [];
      for (;;) {
        const data = await graphqlRequest<CharacterRegionsQuery>(REGIONS, {
          limit: 200,
          offset: items.length,
        });
        const page = z.array(namedOption).parse(data.regions);
        items.push(...page);
        if (page.length < 200) return items;
      }
    })(),
  ]);
  return {
    backstories,
    catalog: catalog.filter((item) => item.available && !item.retired),
    regions,
  };
}
export async function createCharacter(
  input: NewCharacterFields,
  idempotencyKey: string,
) {
  const data = await graphqlRequest<CreateCharacterMutation>(CREATE, {
    input,
    meta: { idempotencyKey },
  });
  return z
    .object({ id: z.string().uuid(), shortCode: z.string().min(1) })
    .parse(data.createCharacter);
}
