import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { loadCharacterDirectory } from '../adapters/characterDirectoryAdapter.js';
import type { PageData } from './useCharacterPage.js';

export const CHARACTER_PAGE_SIZE = 24;

export type CharacterRosterView = { items: CharacterViewModel[]; total: number };

export type CharacterListPageData = PageData<CharacterRosterView> & {
  retry: () => void;
  /** A refetch (pager or filter change) is in flight. */
  fetching: boolean;
  me: ReturnType<typeof useMe>;
  name: string;
  /** Roster status filter ('' = all); `status` is the PageData state. */
  statusFilter: string;
  mine: boolean;
  page: number;
  setPage: (value: number) => void;
  setName: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setMine: (value: boolean) => void;
};

export function useCharacterListPage(): CharacterListPageData {
  const me = useMe();
  const [name, setName] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const filters = {
    namePrefix: name.trim() || undefined,
    status: statusFilter || undefined,
    ownerId: mine ? me.data?.id : undefined,
  };
  const query = useQuery({
    queryKey: ['characters', 'directory', filters, page],
    queryFn: () =>
      loadCharacterDirectory(
        filters,
        CHARACTER_PAGE_SIZE,
        (page - 1) * CHARACTER_PAGE_SIZE,
      ),
    enabled: !mine || Boolean(me.data?.id),
  });
  const shared = {
    retry: () => void query.refetch(),
    fetching: query.isFetching,
    me,
    name,
    statusFilter,
    mine,
    page,
    setPage,
    setName: (value: string) => {
      setPage(1);
      setName(value);
    },
    setStatusFilter: (value: string) => {
      setPage(1);
      setStatusFilter(value);
    },
    setMine: (value: boolean) => {
      setPage(1);
      setMine(value);
    },
  };
  if (query.isError)
    return {
      status: 'error',
      error: toAppError(query.error, 'character:directory'),
      ...shared,
    };
  if (query.isPending) return { status: 'loading', ...shared };
  if (query.data.items.length === 0) return { status: 'empty', ...shared };
  return { status: 'ready', view: query.data, ...shared };
}
