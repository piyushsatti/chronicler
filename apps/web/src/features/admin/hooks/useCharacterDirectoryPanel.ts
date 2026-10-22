import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadAdminCharacters, loadAllAdminRegions } from '../adapters/adminAdapter.js';
import { useAdminAuthority } from './useAdminAuthority.js';
import { useAdminPage } from './useAdminPage.js';

export function useCharacterDirectoryPanel({
  withRegionOptions = true,
}: { withRegionOptions?: boolean } = {}) {
  const authority = useAdminAuthority();
  const [namePrefix, setNamePrefix] = useState('');
  const [status, setStatus] = useState('');
  const [regionId, setRegionId] = useState('');
  const page = useAdminPage(
    ['adminCharacters'],
    authority,
    { namePrefix, status, regionId },
    (pagination, request) =>
      loadAdminCharacters(
        {
          ...pagination,
          namePrefix: namePrefix || undefined,
          status: status || undefined,
          regionId: regionId || undefined,
        },
        request,
      ),
  );
  // Same cache entry the Content tab's region filters read.
  const regions = useQuery({
    enabled: authority.allowed && withRegionOptions,
    queryKey: ['adminRegionOptions', authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadAllAdminRegions, signal),
  });
  return {
    ...page,
    regions,
    retryRegions: () => {
      void regions.refetch();
    },
    namePrefix,
    setNamePrefix,
    status,
    setStatus,
    regionId,
    setRegionId,
  };
}
export type CharacterDirectoryPanelView = ReturnType<typeof useCharacterDirectoryPanel>;
