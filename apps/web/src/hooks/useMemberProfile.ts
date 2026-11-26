import { queryKeys } from '../api/queryKeys.js';
import { useQuery } from '@tanstack/react-query';
import { loadMemberProfile } from '../adapters/memberProfileAdapter.js';

export function useMemberProfile(handle: string) {
  const normalized = handle.replace(/^@/, '').trim();
  return useQuery({
    queryKey: queryKeys.memberProfile(normalized),
    queryFn: () => loadMemberProfile(normalized),
    enabled: Boolean(normalized),
  });
}
