import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useToast } from '../../../hooks/useToast.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadMyCharacters,
  loadQuestBoardChrome,
  loadQuestList,
  mapToBoardCardProps,
  type QuestBoardItemView,
  type QuestBoardCardPropsView,
  type QuestListFilters,
} from '../adapters/questAdapter.js';
import { loadQuestAuthoringAuthority } from '../adapters/questOptionsAdapter.js';
import { useQuestMutations } from './useQuestMutations.js';

export type BoardSegment = 'Open' | 'Scheduled' | 'Live' | 'All';
type CardRow = QuestBoardItemView & { card: QuestBoardCardPropsView };
type PageData =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: CardRow[] };
const PAGE_SIZE = 50;
const FILTERS: Record<BoardSegment, QuestListFilters> = {
  Open: { status: 'open' },
  Scheduled: { displayStatus: 'scheduled' },
  Live: { displayStatus: 'live' },
  All: {},
};
export function useQuestBoardPage() {
  const { timeZone } = useDateFormatter();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const [segment, setSegment] = useState<BoardSegment>('Open');
  const filters = FILTERS[segment];
  const query = useInfiniteQuery({
    queryKey: ['quests', 'pages', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      loadQuestList({ filters, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return last.items.length && loaded < last.total ? loaded : undefined;
    },
  });
  const open = useQuery({
    queryKey: queryKeys.questList(FILTERS.Open, 1, 0),
    queryFn: () => loadQuestList({ filters: FILTERS.Open, limit: 1, offset: 0 }),
  });
  const live = useQuery({
    queryKey: queryKeys.questList(FILTERS.Live, PAGE_SIZE, 0),
    queryFn: () =>
      loadQuestList({ filters: FILTERS.Live, limit: PAGE_SIZE, offset: 0 }),
  });
  const chrome = useQuery({
    queryKey: ['questBoardChrome'],
    queryFn: loadQuestBoardChrome,
  });
  const characters = useQuery({
    queryKey: ['questCharacters', me.data?.id],
    queryFn: loadMyCharacters,
    enabled: isAuthenticated && Boolean(me.data),
    retry: false,
  });
  const authority = useQuery({
    queryKey: ['questAuthority', me.data?.id, me.data?.handle],
    queryFn: () => loadQuestAuthoringAuthority(me.data?.handle ?? ''),
    enabled: isAuthenticated && Boolean(me.data),
  });
  const commands = useQuestMutations('', '');
  const ids = new Set(characters.data?.map((character) => character.id) ?? []);
  const mine = (quest: QuestBoardItemView) =>
    quest.participants.filter(
      (participant) =>
        ids.has(participant.characterId) &&
        (participant.status === 'signed_up' || participant.status === 'waitlisted'),
    );
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const shared = {
    segment,
    setSegment,
    total: query.data?.pages[0]?.total ?? null,
    openCount: open.isError ? null : (open.data?.total ?? null),
    liveCount: live.isError ? null : (live.data?.total ?? null),
    dmsAcceptingCount: chrome.isError ? null : (chrome.data?.dmsAcceptingCount ?? null),
    metadataError: open.error ?? live.error ?? chrome.error ?? characters.error,
    retryMetadata: () => {
      void open.refetch();
      void live.refetch();
      void chrome.refetch();
      if (isAuthenticated && me.data) void characters.refetch();
    },
    liveStrip: (live.data?.items ?? []).slice(0, 6).map((quest) => ({
      id: quest.id,
      shortCode: quest.shortCode,
      title: quest.title,
      dmHandle: quest.dmHandle,
    })),
    canCreate:
      !authority.isError &&
      authority.data?.memberId === me.data?.id &&
      authority.data?.canCreate === true,
    retry: () => {
      void query.refetch();
    },
    hasMore: query.hasNextPage,
    isFetching: query.isFetching,
    isBoardMutating: commands.pending,
    loadMore: () => {
      if (!query.isFetching) void query.fetchNextPage();
    },
    onOpenQuest: (shortCode: string) =>
      navigate(`/quests/${encodeURIComponent(shortCode)}`),
    onSignUp: (quest: QuestBoardItemView) =>
      navigate(`/quests/${encodeURIComponent(quest.shortCode)}#participation`),
    onWithdraw: (quest: QuestBoardItemView) => {
      const participants = mine(quest);
      if (participants.length !== 1)
        navigate(`/quests/${encodeURIComponent(quest.shortCode)}#participation`);
      else
        void commands
          .execute({
            kind: 'withdraw',
            questId: quest.id,
            characterId: participants[0].characterId,
          })
          .then((success) => {
            if (success) addToast('Your character has withdrawn.', 'success');
          });
    },
    isMine: (quest: QuestBoardItemView) => mine(quest).length > 0,
    actionError: commands.error,
  };
  let page: PageData;
  if (query.isError)
    page = { status: 'error', error: toAppError(query.error, 'quest:board') };
  else if (!query.data) page = { status: 'loading' };
  else if (!items.length) page = { status: 'empty' };
  else
    page = {
      status: 'ready',
      view: items.map((quest) => ({
        ...quest,
        card: mapToBoardCardProps(quest, timeZone),
      })),
    };
  return { ...page, ...shared };
}
