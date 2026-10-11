import { useQuery } from '@tanstack/react-query';
import { loadEntityLinkIndex } from '../adapters/entityLinkIndexAdapter.js';
import { queryKeys } from '../feature.js';

/** Site-wide labels; callers receive the failure state as well as autocomplete data. */
export function useEntityLinkIndex(enabled = true) {
  return useQuery({
    queryKey: queryKeys.entityLinkIndex,
    queryFn: loadEntityLinkIndex,
    enabled,
    staleTime: 60_000,
  });
}
