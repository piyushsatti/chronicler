import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadEditorRevisions } from '../adapters/editorLifecycle.js';

export function useEditorHistory(documentId: string | null, enabled: boolean) {
  const [navigation, setNavigation] = useState({ documentId, offset: 0, open: false });
  const { offset, open } =
    navigation.documentId === documentId ? navigation : { offset: 0, open: false };
  const setOffset = (next: (value: number) => number) =>
    setNavigation({ documentId, offset: next(offset), open });
  const setOpen = (next: (value: boolean) => boolean) =>
    setNavigation({ documentId, offset, open: next(open) });
  const query = useQuery({
    queryKey: ['editor', 'revisions', documentId, offset],
    queryFn: () => loadEditorRevisions(documentId ?? '', offset),
    enabled: enabled && documentId !== null,
  });
  return {
    error: query.error,
    loading: query.isPending,
    fetching: query.isFetching,
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    refetch: query.refetch,
    offset,
    open,
    toggle: () => setOpen((value) => !value),
    previous: () => setOffset((value) => Math.max(0, value - 20)),
    next: () => setOffset((value) => value + 20),
  };
}
