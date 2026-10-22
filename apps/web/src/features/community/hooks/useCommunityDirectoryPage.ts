import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCommunityMembers } from '../adapters/communityAdapter.js';
import type { CommunityMemberView } from '../types.js';

export const DIRECTORY_PAGE_SIZE = 24;

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; retry: () => void }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export type MemberDirectoryView = {
  items: CommunityMemberView[];
  total: number;
};

export type MemberDirectoryControls = {
  search: string;
  acceptingOnly: boolean;
  page: number;
  pageCount: number;
  isFetching: boolean;
  setPage: (page: number) => void;
  setSearch: (value: string) => void;
  setAcceptingOnly: (value: boolean) => void;
};

export function useCommunityDirectoryPage(
  role: 'dm' | 'player',
): PageData<MemberDirectoryView> & MemberDirectoryControls {
  const [search, setSearch] = useState('');
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['communityMembers', role, search, acceptingOnly, page],
    queryFn: () =>
      loadCommunityMembers(
        role,
        search,
        acceptingOnly,
        (page - 1) * DIRECTORY_PAGE_SIZE,
      ),
    // Typing in the search box keeps the last list on screen instead of a flash of loading.
    placeholderData: keepPreviousData,
  });
  const controls: MemberDirectoryControls = {
    search,
    acceptingOnly,
    page,
    pageCount: Math.max(1, Math.ceil((query.data?.total ?? 0) / DIRECTORY_PAGE_SIZE)),
    isFetching: query.isFetching,
    setPage,
    setSearch: (value: string) => {
      setPage(1);
      setSearch(value);
    },
    setAcceptingOnly: (value: boolean) => {
      setPage(1);
      setAcceptingOnly(value);
    },
  };
  if (query.isError) {
    return {
      status: 'error',
      error: toAppError(query.error, 'community:directory'),
      retry: () => {
        void query.refetch();
      },
      ...controls,
    };
  }
  if (!query.data) return { status: 'loading', ...controls };
  if (query.data.items.length === 0) return { status: 'empty', ...controls };
  return { status: 'ready', view: query.data, ...controls };
}
