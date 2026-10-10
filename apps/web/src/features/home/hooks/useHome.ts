import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadHome } from '../adapters/homeAdapter.js';

export function useHome() {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: loadHome,
  });
}
