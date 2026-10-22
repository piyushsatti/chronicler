import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSearch } from '../adapters/searchAdapter.js';

export function useSearchPalette() {
  const [query, setQuery] = useState('');
  const queryError =
    Array.from(query).length > 200 ? 'Use 200 characters or fewer.' : null;
  const searchQ = useQuery({
    queryKey: queryKeys.search(
      query,
      JSON.stringify({ kinds: null, offset: 0, limit: 20 }),
    ),
    queryFn: () => loadSearch(query),
    enabled: query.trim().length > 0 && !queryError,
  });
  return {
    query,
    setQuery,
    queryError,
    searchQ,
    retrySearch: () => {
      void searchQ.refetch();
    },
  };
}
