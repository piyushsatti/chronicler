import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadMemberHub,
  loadMemberRoster,
  loadUpcomingSignups,
  type MemberHubView,
  type RosterCharacter,
  type UpcomingSignup,
} from '../adapters/memberHubAdapter.js';

type Slice<T> =
  | { status: 'error'; error: AppError }
  | { status: 'loading' }
  | { status: 'ready'; data: T };

export type MemberHub = {
  hub: Slice<MemberHubView>;
  roster: Slice<RosterCharacter[]>;
  upcoming: Slice<UpcomingSignup[]>;
  retry: () => void;
};

function slice<T>(
  q: { isError: boolean; error: unknown; data: T | undefined },
  scope: string,
): Slice<T> {
  if (q.isError) return { status: 'error', error: toAppError(q.error, scope) };
  if (q.data === undefined) return { status: 'loading' };
  return { status: 'ready', data: q.data };
}

/** Everything the /me hub shows beyond identity: stats, roster, upcoming sign-ups. */
export function useMemberHub(memberId: string): MemberHub {
  const hubQ = useQuery({
    queryKey: ['memberHub', memberId],
    queryFn: () => loadMemberHub(memberId),
    enabled: Boolean(memberId),
  });
  const rosterQ = useQuery({
    queryKey: ['characters', 'mine', memberId],
    queryFn: loadMemberRoster,
    enabled: Boolean(memberId),
  });
  const upcomingQ = useQuery({
    queryKey: ['quests', 'mine-upcoming', memberId],
    queryFn: () => loadUpcomingSignups(memberId, new Date().toISOString()),
    enabled: Boolean(memberId),
  });
  return {
    hub: slice(hubQ, 'me:hub'),
    roster: slice(rosterQ, 'me:roster'),
    upcoming: slice(upcomingQ, 'me:upcoming'),
    retry: () => {
      void hubQ.refetch();
      void rosterQ.refetch();
      void upcomingQ.refetch();
    },
  };
}
