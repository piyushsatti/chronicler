import { z } from 'zod';
import type { ProfileDmTierQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './profileDmTier.graphql?raw';

const schema = z.object({ dmTier: z.string() });

export async function loadProfileDmTier(): Promise<string> {
  try {
    const data = await graphqlRequest<ProfileDmTierQuery>(QUERY);
    const parsed = schema.safeParse(data.myUnlocks);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'profile:dmTier');
    return parsed.data.dmTier;
  } catch (error) {
    throw toAppError(error, 'profile:dmTier');
  }
}
