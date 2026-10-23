import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  type MemberProfileView,
} from '../adapters/memberProfileAdapter.js';

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
  | { status: 'ready'; member: ProfileMemberView; profile: MemberProfileView };

export function useProfileBody(shortCode: string): ProfileBodyView {
  const handle = normalizeHandle(shortCode);
  const profile = useMemberProfile(handle);

  if (profile.isError) {
    return { status: 'error', error: toAppError(profile.error, 'profile:page') };
  }
  if (handle && (profile.isLoading || profile.data === undefined)) {
    return { status: 'loading' };
  }
  if (!handle || profile.data == null) return { status: 'empty' };

  const view = profile.data;
  const isDm =
    view.member.status === 'active' &&
    view.member.roles.includes('dm') &&
    view.dmProfile?.status === 'approved';
  return {
    status: 'ready',
    profile: view,
    member: {
      handle: view.member.handle,
      displayName: view.member.displayName,
      tagline: view.dmProfile?.tagline ?? null,
      acceptingPlayers: view.dmProfile?.acceptingPlayers === true,
      isDm,
    },
  };
}
