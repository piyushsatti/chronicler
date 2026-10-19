import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadMemberProfile } from '../adapters/memberProfileAdapter.js';

function normalizeHandle(raw: string | undefined): string {
  if (!raw) return '';
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

export type ProfileMemberView = {
  handle: string;
  displayName: string;
  tagline: string | null;
  acceptingPlayers: boolean;
  isDm: boolean;
};

export type ProfileBodyView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; member: ProfileMemberView };

export function useProfileBody(
  _role: 'dm' | 'player',
  shortCode: string,
): ProfileBodyView {
  const handle = normalizeHandle(shortCode);
  const profile = useQuery({
    queryKey: ['memberProfile', handle],
    queryFn: () => loadMemberProfile(handle),
    enabled: handle.length > 0,
  });

  if (!handle) return { status: 'empty' };
  if (profile.isError) {
    return { status: 'error', error: toAppError(profile.error, 'profile:page') };
  }
  if (profile.isLoading || profile.data === undefined) {
    return { status: 'loading' };
  }
  if (profile.data == null) return { status: 'empty' };

  const view = profile.data;
  const isDm =
    view.dmProfile != null || view.member.roles.includes('dm');
  return {
    status: 'ready',
    member: {
      handle: view.member.handle,
      displayName: view.member.displayName,
      tagline: view.dmProfile?.tagline ?? null,
      acceptingPlayers: view.dmProfile?.acceptingPlayers === true,
      isDm,
    },
  };
}

export { normalizeHandle };
