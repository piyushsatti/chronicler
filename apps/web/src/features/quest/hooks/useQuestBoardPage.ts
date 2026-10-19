import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSizeClasses } from '@pi/react-imposition/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { isDm } from '../../../auth/roles.js';
import { useMe } from '../../../hooks/useMe.js';
import { useToast } from '../../../components/primitives/Toast.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadMyCharacters,
  loadQuestBoardChrome,
  loadQuestList,
  signupForQuest,
  withdrawFromQuest,
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

const SEATED = new Set(['signed_up', 'played', 'selected']);

export function useQuestBoardPage(): PageData<QuestBoardItemView[]> & {
  segment: BoardSegment;
  setSegment: (segment: BoardSegment) => void;
  columns: 1 | 2;
  total: number | null;
  openCount: number;
  liveCount: number;
  dmsAcceptingCount: number;
  liveStrip: Array<{
    id: string;
    shortCode: string;
    title: string;
    dmHandle: string | null;
  }>;
  canCreate: boolean;
  retry: () => void;
  hasMore: boolean;
  isFetching: boolean;
  isBoardMutating: boolean;
  loadMore: () => void;
  onOpenQuest: (shortCode: string) => void;
  onSignUp: (quest: QuestBoardItemView) => void;
  onWithdraw: (quest: QuestBoardItemView) => void;
  isMine: (quest: QuestBoardItemView) => boolean;
  onJoinVoice: () => void;
} {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const queryClient = useQueryClient();
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

  const openQ = useQuery({
    queryKey: queryKeys.questList(SEGMENT_FILTERS.Open, PAGE_SIZE, 0),
    queryFn: () => loadQuestList({ filters: SEGMENT_FILTERS.Open, limit: PAGE_SIZE, offset: 0 }),
  });

  const liveQ = useQuery({
    queryKey: queryKeys.questList(SEGMENT_FILTERS.Live, PAGE_SIZE, 0),
    queryFn: () => loadQuestList({ filters: SEGMENT_FILTERS.Live, limit: PAGE_SIZE, offset: 0 }),
  });

  const chromeQ = useQuery({
    queryKey: ['questBoardChrome'] as const,
    queryFn: loadQuestBoardChrome,
  });

  const myCharsQ = useQuery({
    queryKey: queryKeys.characters('board-mine'),
    queryFn: loadMyCharacters,
    enabled: isAuthenticated,
  });

  const myCharacterIds = new Set((myCharsQ.data ?? []).map((c) => c.id));
  const activeCharacterIds = (myCharsQ.data ?? [])
    .filter((c) => c.status.toLowerCase() === 'active')
    .map((c) => c.id);

  const signup = useMutation({
    mutationFn: ({ questId, characterId }: { questId: string; characterId: string }) =>
      signupForQuest(questId, characterId),
    onSuccess: async () => {
      addToast("You're in! Signed up.", 'success');
      await queryClient.invalidateQueries({ queryKey: queryKeys.questLists });
    },
    onError: (err) => {
      const app = toAppError(err, 'quest:board:signup');
      addToast(app.userMessage || 'Could not sign up for this quest. Please try again.', 'error');
    },
  });

  const withdraw = useMutation({
    mutationFn: ({ questId, characterId }: { questId: string; characterId: string }) =>
      withdrawFromQuest(questId, characterId),
    onSuccess: async () => {
      addToast('Withdrawn — your slot is now open.', 'success');
      await queryClient.invalidateQueries({ queryKey: queryKeys.questLists });
    },
    onError: (err) => {
      const app = toAppError(err, 'quest:board:withdraw');
      addToast(app.userMessage || 'Could not withdraw. Please try again.', 'error');
    },
  });

  const hasMore = q.data !== undefined && q.data.items.length < q.data.total;
  const liveItems = liveQ.data?.items ?? [];

  function myParticipantFor(quest: QuestBoardItemView) {
    return quest.participants.find(
      (p) => myCharacterIds.has(p.characterId) && SEATED.has(p.status),
    );
  }

  const shared = {
    segment,
    setSegment: (next: BoardSegment) => {
      if (next !== segment) setSelection({ segment: next, limit: PAGE_SIZE });
    },
    columns: (widthClass === 'expanded' ? 2 : 1) as 1 | 2,
    total: q.data?.total ?? null,
    openCount: openQ.data?.total ?? 0,
    liveCount: liveQ.data?.total ?? liveItems.length,
    dmsAcceptingCount: chromeQ.data?.dmsAcceptingCount ?? 0,
    liveStrip: liveItems.map((item) => ({
      id: item.id,
      shortCode: item.shortCode,
      title: item.title,
      dmHandle: item.dmHandle,
    })),
    canCreate: isDm(me.data?.roles),
    retry: () => {
      if (!q.isFetching) void q.refetch();
    },
    hasMore,
    isFetching: q.isFetching,
    isBoardMutating: signup.isPending || withdraw.isPending,
    loadMore: () => {
      if (hasMore && !q.isFetching) {
        setSelection((current) => ({ ...current, limit: current.limit + PAGE_SIZE }));
      }
    },
    onOpenQuest: (shortCode: string) => {
      navigate(`/quests/${shortCode}`);
    },
    onSignUp: (quest: QuestBoardItemView) => {
      if (activeCharacterIds.length !== 1) {
        navigate(`/quests/${quest.shortCode}`);
        return;
      }
      signup.mutate({ questId: quest.id, characterId: activeCharacterIds[0] });
    },
    onWithdraw: (quest: QuestBoardItemView) => {
      const participant = myParticipantFor(quest);
      if (!participant) return;
      withdraw.mutate({ questId: quest.id, characterId: participant.characterId });
    },
    isMine: (quest: QuestBoardItemView) => myParticipantFor(quest) !== undefined,
    onJoinVoice: () => {
      addToast('Opening voice channel in Discord…', 'info');
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
