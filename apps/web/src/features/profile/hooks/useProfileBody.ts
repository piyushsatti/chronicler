import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadProfileHub,
  type ProfileMemberView,
} from '../adapters/profileCommunityAdapter.js';

function normalizeHandle(raw: string | undefined): string {
  if (!raw) return '';
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

function findMember(
  members: ProfileMemberView[],
  shortCode: string,
): ProfileMemberView | undefined {
  const handle = normalizeHandle(shortCode).toLowerCase();
  return members.find((member) => member.handle.toLowerCase() === handle);
}

export type ProfileBodyView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; member: ProfileMemberView };

export function useProfileBody(
  role: 'dm' | 'player',
  shortCode: string,
): ProfileBodyView {
  const hub = useQuery({
    queryKey: queryKeys.communityHub,
    queryFn: loadProfileHub,
  });

  if (hub.isError) {
    return { status: 'error', error: toAppError(hub.error, 'profile:page') };
  }
  if (hub.isLoading || !hub.data) {
    return { status: 'loading' };
  }

  const pool = role === 'dm' ? hub.data.dms : hub.data.players;
  const member =
    findMember(pool, shortCode) ??
    findMember([...hub.data.dms, ...hub.data.players], shortCode);

  if (!member) return { status: 'empty' };
  return { status: 'ready', member };
}

export { normalizeHandle };
