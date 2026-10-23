import { useQuery } from '@tanstack/react-query';
import { loadMap } from '../adapters/mapAdapter.js';
import { queryKeys } from '../feature.js';

export function useMapCard(atlasCode: string) {
  const query = useQuery({
    queryKey: queryKeys.map(atlasCode),
    queryFn: () => loadMap(atlasCode),
  });
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}
