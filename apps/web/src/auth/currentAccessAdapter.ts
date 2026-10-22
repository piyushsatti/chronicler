import { z } from 'zod';
import { graphqlRequest } from '../api/graphql.js';
import type {
  CurrentAdminAccessQuery,
  CurrentReviewAccessQuery,
} from '../api/graphql.operations.gen.js';
import { toAppError } from '../errors/toAppError.js';
import ADMIN_ACCESS from './currentAdminAccess.graphql?raw';
import REVIEW_ACCESS from './currentReviewAccess.graphql?raw';

export type CurrentAccessKind = 'admin' | 'review';

export async function readCurrentAccess(
  kind: CurrentAccessKind,
  token: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const init = { headers: { Authorization: `Bearer ${token}` }, signal };
    const count =
      kind === 'admin'
        ? (await graphqlRequest<CurrentAdminAccessQuery>(ADMIN_ACCESS, undefined, init))
            .adminOperations.activeAlertCount
        : (
            await graphqlRequest<CurrentReviewAccessQuery>(
              REVIEW_ACCESS,
              undefined,
              init,
            )
          ).pendingDmProfileVerifications.total;
    if (!z.number().int().nonnegative().safeParse(count).success) {
      throw toAppError({ failure: 'InvalidWire' }, 'access:proof');
    }
    return true;
  } catch (error) {
    const failure = toAppError(error, 'access:proof');
    if (failure.kind === 'forbidden') return false;
    throw failure;
  }
}
