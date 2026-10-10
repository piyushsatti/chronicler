import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadHomeLanes } from '../adapters/homeLanesAdapter.js';

export function useHomeLanes() {
  return useQuery({
    queryKey: queryKeys.homeLanes,
    queryFn: loadHomeLanes,
  });
}
