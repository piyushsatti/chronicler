import { useQuery } from '@tanstack/react-query';
import { useMe } from '../../../hooks/useMe.js';
import { loadMemberRoster } from '../adapters/memberHubAdapter.js';

/**
 * True when `code` is one of the signed-in member's own characters. Shares the
 * /me roster cache, and only fetches when asked about a code (the nav asks on
 * character routes), so every other route pays nothing.
 */
export function useOwnsCharacter(code: string | null): boolean {
  const memberId = useMe().data?.id;
  const roster = useQuery({
    queryKey: ['characters', 'mine', memberId ?? ''],
    queryFn: loadMemberRoster,
    enabled: Boolean(memberId) && code !== null,
  });
  return code !== null && (roster.data ?? []).some((c) => c.shortCode === code);
}
