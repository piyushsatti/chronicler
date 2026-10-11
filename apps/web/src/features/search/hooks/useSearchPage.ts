import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSearch, loadSearchKinds } from '../adapters/searchAdapter.js';

export function useSearchPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const kindsQ = useQuery({
    queryKey: queryKeys.searchKinds,
    queryFn: loadSearchKinds,
  });
  const kindsKey = kind || 'all';
  const searchQ = useQuery({
    queryKey: queryKeys.search(query, kindsKey),
    queryFn: () => loadSearch(query, kind ? [kind] : undefined),
    enabled: query.trim().length > 0,
  });
  const kinds = useMemo(() => kindsQ.data ?? [], [kindsQ.data]);

  return {
    query,
    setQuery,
    kind,
    setKind,
    kinds,
    searchQ,
  };
}
