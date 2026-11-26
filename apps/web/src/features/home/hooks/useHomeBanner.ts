import { queryKeys } from '../../../api/queryKeys.js';
import { useQuery } from '@tanstack/react-query';
import { loadHomeBanner } from '../adapters/homeBannerAdapter.js';

export function useHomeBanner() {
  return useQuery({
    queryKey: queryKeys.homeBanner(),
    queryFn: loadHomeBanner,
  });
}
