import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSiteStats } from '../adapters/homeAdapter.js';

export function useSiteStats() {
  return useQuery({
    queryKey: queryKeys.siteStats,
    queryFn: loadSiteStats,
  });
}
