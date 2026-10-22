import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import { hasRole } from '../auth/roles.js';
import { toAppError } from '../errors/toAppError.js';
import type { AppError } from '../errors/types.js';
import {
  isLiveDm,
  loadAuthoringAuthority,
} from '../features/quest/adapters/questOptionsAdapter.js';
import { useMe } from './useMe.js';

export type LiveDmState =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; retry: () => void }
  | { status: 'ready'; liveDm: boolean };

/**
 * Whether the signed-in member is a LiveDM, the API's rule for quest creation:
 * the dm role and an approved DM profile. Accounts without the dm role are
 * answered from `me` alone; only DMs wait on the profile read. Pass `needed`
 * false where the answer is not used, so no read is made.
 */
export function useLiveDm(needed = true): LiveDmState {
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const dm = hasRole(me.data?.roles, 'dm');
  const authority = useQuery({
    queryKey: ['liveDm', me.data?.id, me.data?.handle],
    queryFn: () => loadAuthoringAuthority(me.data?.handle ?? ''),
    enabled: needed && isAuthenticated && dm,
    retry: false,
  });
  if (me.isError)
    return {
      status: 'error',
      error: toAppError(me.error, 'liveDm:account'),
      retry: () => void me.refetch(),
    };
  // A disabled read (no dm role, or not needed) never errors.
  if (authority.isError)
    return {
      status: 'error',
      error: toAppError(authority.error, 'liveDm:profile'),
      retry: () => void authority.refetch(),
    };
  if (!me.data || (dm && !authority.data)) return { status: 'loading' };
  return {
    status: 'ready',
    liveDm:
      authority.data !== undefined &&
      authority.data.memberId === me.data.id &&
      isLiveDm(authority.data),
  };
}
