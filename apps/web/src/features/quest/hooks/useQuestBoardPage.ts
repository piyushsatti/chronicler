import { useState } from 'react';
import { useSizeClasses } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadQuestList,
  type QuestBoardItemView,
  type QuestListFilters,
} from '../adapters/questAdapter.js';

export type BoardSegment = 'Open' | 'Scheduled' | 'Live' | 'All';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

const PAGE_SIZE = 50;
const SEGMENT_FILTERS: Record<BoardSegment, QuestListFilters> = {
  Open: { status: 'open' },
  Scheduled: { displayStatus: 'scheduled' },
  Live: { displayStatus: 'live' },
  All: {},
};

export function useQuestBoardPage(): PageData<QuestBoardItemView[]> & {
  segment: BoardSegment;
  setSegment: (segment: BoardSegment) => void;
  columns: 1 | 2;
  total: number | null;
  retry: () => void;
  hasMore: boolean;
  isFetching: boolean;
  loadMore: () => void;
} {
  const [{ segment, limit }, setSelection] = useState({
    segment: 'Open' as BoardSegment,
    limit: PAGE_SIZE,
  });
  const { widthClass } = useSizeClasses();
  const filters = SEGMENT_FILTERS[segment];
  const q = useQuery({
    queryKey: queryKeys.questList(filters, limit, 0),
    queryFn: () => loadQuestList({ filters, limit, offset: 0 }),
  });
  const hasMore = q.data !== undefined && q.data.items.length < q.data.total;

  const shared = {
    segment,
    setSegment: (next: BoardSegment) => {
      if (next !== segment) setSelection({ segment: next, limit: PAGE_SIZE });
    },
    columns: (widthClass === 'expanded' ? 2 : 1) as 1 | 2,
    total: q.data?.total ?? null,
    retry: () => {
      if (!q.isFetching) void q.refetch();
    },
    hasMore,
    isFetching: q.isFetching,
    loadMore: () => {
      if (hasMore && !q.isFetching) {
        setSelection((current) => ({ ...current, limit: current.limit + PAGE_SIZE }));
      }
    },
  };

  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'quest:board-page'),
      ...shared,
    };
  }
  if (q.isLoading || q.data === undefined) {
    return { status: 'loading', ...shared };
  }
  if (q.data.items.length === 0) {
    return { status: 'empty', ...shared };
  }
  return { status: 'ready', view: q.data.items, ...shared };
}
