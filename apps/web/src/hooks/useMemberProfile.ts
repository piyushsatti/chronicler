import { useQuery } from '@tanstack/react-query';
import { loadMemberProfile } from '../features/profile/adapters/memberProfileAdapter.js';

export function useMemberProfile(handle: string) {
  const normalized = handle.replace(/^@/, '').trim();
  return useQuery({
    queryKey: ['memberProfile', normalized],
    queryFn: () => loadMemberProfile(normalized),
    enabled: Boolean(normalized),
  });
}
