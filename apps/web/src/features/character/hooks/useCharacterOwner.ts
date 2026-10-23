import { useAuth } from '../../../auth/AuthContext.js';
import { useQuery } from '@tanstack/react-query';
import { loadCharacterOwner } from '../adapters/characterOwnerAdapter.js';

export function useCharacterOwner(ownerId: string | null) {
  const { token, sessionReady } = useAuth();
  const query = useQuery({
    queryKey: ['characterOwner', ownerId],
    enabled: sessionReady && Boolean(ownerId),
    queryFn: ({ signal }) => loadCharacterOwner(ownerId, { signal, headers: { Authorization: token ? `Bearer ${token}` : '' } }),
  });
  return { ...query, retry: () => void query.refetch() };
}
