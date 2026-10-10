import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadQuestBoard,
  type QuestBoardItemView,
} from '../adapters/questAdapter.js';

export type BoardSegment = 'Open' | 'Scheduled' | 'Live' | 'All';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

function filterBoard(
  items: QuestBoardItemView[],
  segment: BoardSegment,
): QuestBoardItemView[] {
  if (segment === 'All') return items;
  return items.filter((item) => {
    const label = item.status.toLowerCase();
    if (segment === 'Open') return label === 'open' || label === 'full';
    if (segment === 'Scheduled') return label === 'scheduled';
    if (segment === 'Live') return label === 'live';
    return true;
  });
}

export function useQuestBoardPage(): PageData<QuestBoardItemView[]> & {
  segment: BoardSegment;
  setSegment: (segment: BoardSegment) => void;
  myFriends: boolean;
  setMyFriends: (next: boolean) => void;
} {
  const [segment, setSegment] = useState<BoardSegment>('Open');
  const [myFriends, setMyFriends] = useState(false);
  const q = useQuery({
    queryKey: queryKeys.questBoard,
    queryFn: loadQuestBoard,
  });

  const filtered = useMemo(() => {
    if (!q.data) return [];
    void myFriends;
    return filterBoard(q.data, segment);
  }, [q.data, segment, myFriends]);

  const shared = {
    segment,
    setSegment,
    myFriends,
    setMyFriends,
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
  if (filtered.length === 0) {
    return { status: 'empty', ...shared };
  }
  return { status: 'ready', view: filtered, ...shared };
}
