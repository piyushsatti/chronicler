import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { loadCharacterDirectory, loadCharacterRegionNames } from '../adapters/characterDirectoryAdapter.js';
import type { PageData } from './useCharacterPage.js';
import { loadCharacterOwner } from '../adapters/characterOwnerAdapter.js';
import { personLabels } from '../../../utils/format.js';

export const CHARACTER_PAGE_SIZE = 24;
const REGION_QUERY_STATUS = {
  pending: 'loading',
  error: 'error',
  success: 'ready',
} as const;

export type CharacterRosterView = { items: CharacterViewModel[]; total: number };

export type CharacterListPageData = PageData<CharacterRosterView> & {
  retry: () => void;
  /** A refetch (pager or filter change) is in flight. */
  fetching: boolean;
  me: ReturnType<typeof useMe>;
  regionNames: Record<string, string>;
  regionNamesStatus: 'loading' | 'ready' | 'error';
  playerLabels: Record<string, string>;
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
  const { token, sessionReady } = useAuth();
  const me = useMe();
  const regionNames = useQuery({
    queryKey: ['characterRegions'],
    queryFn: loadCharacterRegionNames,
    staleTime: 5 * 60 * 1000,
  });
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
  const ownerIds = [...new Set((query.data?.items ?? []).flatMap((character) =>
    character.ownerId ? [character.ownerId] : [],
  ))];
  const owners = useQueries({
    queries: ownerIds.map((ownerId) => ({
      queryKey: ['characterOwner', ownerId],
      enabled: sessionReady,
      queryFn: ({ signal }: { signal: AbortSignal }) => loadCharacterOwner(ownerId, { signal, headers: { Authorization: token ? `Bearer ${token}` : '' } }),
    })),
  });
  const loadedOwners = owners.flatMap((owner) => owner.data ? [owner.data] : []);
  const labels = personLabels(loadedOwners);
  const namesByOwner = new Map(loadedOwners.map((owner, index) => [owner.id, labels[index]]));
  const playerLabels = Object.fromEntries(owners.map((owner, index) => [
    ownerIds[index],
    namesByOwner.get(ownerIds[index]) ?? (owner.isSuccess || owner.isError
      ? 'Player profile unavailable'
      : 'Loading player…'),
  ]));
  const regionNamesStatus: CharacterListPageData['regionNamesStatus'] = REGION_QUERY_STATUS[regionNames.status];
  const shared = {
    retry: () => {
      void query.refetch();
      void regionNames.refetch();
    },
    fetching: query.isFetching,
    me,
    regionNames: regionNames.data ?? {},
    regionNamesStatus,
    playerLabels,
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
