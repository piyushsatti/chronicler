import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadSearch, loadSearchKinds } from '../adapters/searchAdapter.js';

export const SEARCH_PAGE_SIZE = 20;
function pageNumber(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) &&
    page > 0 &&
    page <= Math.floor(2147483647 / SEARCH_PAGE_SIZE)
    ? page
    : 1;
}

export function useSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const kinds = params.has('kinds')
    ? (params.get('kinds') ?? '').split(',').filter(Boolean)
    : null;
  const documentPage = pageNumber(params.get('documents'));
  const memberPage = pageNumber(params.get('members'));
  const queryLength = Array.from(query).length;
  const queryError = queryLength > 200 ? 'Use 200 characters or fewer.' : null;
  const kindsQ = useQuery({
    queryKey: queryKeys.searchKinds,
    queryFn: loadSearchKinds,
  });
  const kindsError =
    kinds &&
    (kinds.length > 100 ||
      (kindsQ.isSuccess &&
        kinds.some((key) => !kindsQ.data.some((kind) => kind.key === key))))
      ? 'That search kind is unavailable. Choose a listed kind or search all kinds.'
      : null;
  const enabled = query.trim().length > 0 && !queryError && !kindsError;
  const documentOffset = (documentPage - 1) * SEARCH_PAGE_SIZE;
  const memberOffset = (memberPage - 1) * SEARCH_PAGE_SIZE;
  const documentQ = useQuery({
    queryKey: queryKeys.search(
      query,
      JSON.stringify({ kinds, offset: documentOffset, limit: SEARCH_PAGE_SIZE }),
    ),
    queryFn: () => loadSearch(query, kinds, SEARCH_PAGE_SIZE, documentOffset),
    enabled: enabled && (kinds === null || kinds.some((kind) => kind !== 'member')),
  });
  const memberQ = useQuery({
    queryKey: queryKeys.search(
      query,
      JSON.stringify({ kinds, offset: memberOffset, limit: SEARCH_PAGE_SIZE }),
    ),
    queryFn: () => loadSearch(query, kinds, SEARCH_PAGE_SIZE, memberOffset),
    enabled: enabled && (kinds === null || kinds.includes('member')),
  });
  function update(changes: Record<string, string | null>, replace = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace },
    );
  }
  return {
    query,
    queryError,
    kindsError,
    kinds,
    kindsQ,
    documentQ,
    memberQ,
    documentPage,
    memberPage,
    retryKinds: () => {
      void kindsQ.refetch();
    },
    retryDocuments: () => {
      void documentQ.refetch();
    },
    retryMembers: () => {
      void memberQ.refetch();
    },
    setQuery: (value: string) =>
      update({ q: value || null, documents: null, members: null }, true),
    setKinds: (value: string[] | null) =>
      update({
        kinds: value === null ? null : value.join(','),
        documents: null,
        members: null,
      }),
    setDocumentPage: (page: number) =>
      update({ documents: page === 1 ? null : String(page) }),
    setMemberPage: (page: number) =>
      update({ members: page === 1 ? null : String(page) }),
  };
}
