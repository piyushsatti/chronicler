import { useQuery } from '@tanstack/react-query';
import { loadRetainedDocument } from '../adapters/retainedDocumentAdapter.js';

export function useRetainedDocument(identity: string | undefined) {
  const query = useQuery({
    queryKey: ['retainedDocument', identity],
    queryFn: () => loadRetainedDocument(identity ?? ''),
    enabled: Boolean(identity),
    retry: false,
  });
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}
