import { z } from 'zod';
import type { QuestRosterCharactersQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import QUERY from './questRosterSearch.graphql?raw';

const match = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  status: z.string(),
  shortCode: z.string(),
});

export type RosterCharacterMatch = z.infer<typeof match>;

export async function searchRosterCharacters(
  namePrefix: string,
): Promise<RosterCharacterMatch[]> {
  const data = await graphqlRequest<QuestRosterCharactersQuery>(QUERY, { namePrefix });
  return z.array(match).parse(data.characters.items);
}
