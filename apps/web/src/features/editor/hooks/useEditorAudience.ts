import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadAudienceMembers,
  loadAudienceReader,
} from '../adapters/editorAudienceMembers.js';

export function useEditorAudience({
  readerIds,
  setReaderIds,
  enabled,
  scopeKey,
}: {
  readerIds: string;
  setReaderIds: (value: string) => void;
  enabled: boolean;
  scopeKey: string;
}) {
  const [navigation, setNavigation] = useState({ scopeKey, search: '', offset: 0 });
  const { search, offset } =
    navigation.scopeKey === scopeKey ? navigation : { search: '', offset: 0 };
  const setSearch = (search: string) => setNavigation({ scopeKey, search, offset: 0 });
  const setOffset = (next: (value: number) => number) =>
    setNavigation({ scopeKey, search, offset: next(offset) });
  const selectedIds = readerIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const directory = useQuery({
    queryKey: ['editor', 'audience-members', scopeKey, search, offset],
    queryFn: () => loadAudienceMembers(search.trim(), offset),
    enabled: enabled && search.trim().length > 0,
  });
  const selected = useQuery({
    queryKey: ['editor', 'audience-readers', scopeKey, ...selectedIds],
    queryFn: () =>
      Promise.all(
        selectedIds.map(async (id) => ({ id, member: await loadAudienceReader(id) })),
      ),
    enabled: enabled && selectedIds.length > 0,
  });
  return {
    search,
    setSearch,
    matches: directory.data?.entries ?? [],
    total: directory.data?.total ?? 0,
    offset,
    previous: () => setOffset((value) => Math.max(0, value - 20)),
    next: () => setOffset((value) => value + 20),
    loading: directory.isFetching || selected.isFetching,
    error: directory.error ?? selected.error,
    selected: selectedIds.map((id) => ({
      id,
      label:
        selected.data?.find((item) => item.id === id)?.member?.handle ??
        'Existing reader',
    })),
    add: (id: string) => {
      if (!selectedIds.includes(id)) setReaderIds([...selectedIds, id].join(', '));
    },
    remove: (id: string) =>
      setReaderIds(selectedIds.filter((value) => value !== id).join(', ')),
    selectedIds,
  };
}
