import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type { CharacterOwnerQuery } from '../../../api/graphql.operations.gen.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './characterOwner.graphql?raw';

const schema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(1),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
}).nullable();

export async function loadCharacterOwner(id: string | null, init?: RequestInit) {
  const data = await graphqlRequest<CharacterOwnerQuery>(QUERY, { id }, init);
  const parsed = schema.safeParse(data.member);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'character:owner');
  return parsed.data;
}
