import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSignupCharacterId } from '../adapters/questAdapter.js';

export function useSignupCharacter(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.characters('signup'),
    queryFn: loadSignupCharacterId,
    enabled,
  });
}
