import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSearch } from '../adapters/searchAdapter.js';

export function useSearchPalette() {
  const [query, setQuery] = useState('');
  const searchQ = useQuery({
    queryKey: queryKeys.search(query, 'palette'),
    queryFn: () => loadSearch(query),
    enabled: query.trim().length > 0,
  });
  return { query, setQuery, searchQ };
}
