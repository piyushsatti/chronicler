import { useMemo, useState } from 'react';
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
import { useInfiniteScroll } from '../../../components/primitives/useInfiniteScroll.js';
import { dayRangeInZone, personLabels } from '../../../utils/format.js';
import { hasActiveSignup } from '../../../utils/questVocabulary.js';
import {
  filterQuestBoardItems,
  type BoardSegment,
  type QuestQuickFilter,
} from '../questBoardFilters.js';

export type { BoardSegment, QuestQuickFilter } from '../questBoardFilters.js';
type CardRow = QuestBoardItemView & { card: QuestBoardCardPropsView };
type PageData =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: CardRow[] };
const PAGE_SIZE = 50;

/** Filters from the board's Filter popover: a DM id and a specific civil date (YYYY-MM-DD). */
export type QuestBoardFilters = { dmId: string; date: string };
export const NO_BOARD_FILTERS: QuestBoardFilters = { dmId: '', date: '' };

function toServerFilters(filters: QuestBoardFilters, timeZone: string | null): QuestListFilters {
  const range = filters.date ? dayRangeInZone(filters.date, timeZone) : null;
  return {
    ...(filters.dmId ? { dmId: filters.dmId } : {}),
    ...(range ?? {}),
  };
}
export function useQuestBoardPage() {
  const { timeZone } = useDateFormatter();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const [segment, setSegment] = useState<BoardSegment>('Open');
  const [quickFilter, setQuickFilter] = useState<QuestQuickFilter>('All');
  const [search, setSearch] = useState('');
  const [boardFilters, setBoardFilters] = useState<QuestBoardFilters>(NO_BOARD_FILTERS);
  const serverFilters = toServerFilters(boardFilters, timeZone);
  const query = useInfiniteQuery({
    queryKey: ['quests', 'pages', serverFilters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      loadQuestList({ filters: serverFilters, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return last.items.length && loaded < last.total ? loaded : undefined;
    },
  });
  const live = useQuery({
    queryKey: queryKeys.questList({ displayStatus: 'live' }, PAGE_SIZE, 0),
    queryFn: () =>
      loadQuestList({ filters: { displayStatus: 'live' }, limit: PAGE_SIZE, offset: 0 }),
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
        ids.has(participant.characterId) && hasActiveSignup(participant.status),
    );
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // A specific date narrows the API read to that day and overrides the quick date segment.
  const dateOverrides = boardFilters.date !== '';
  const effectiveQuickFilter: QuestQuickFilter = dateOverrides ? 'All' : quickFilter;
  const visibleItems = filterQuestBoardItems(
    items,
    segment,
    effectiveQuickFilter,
    search,
    timeZone,
  );
  const chromeDms = chrome.data?.dms;
  const dmOptions = useMemo(() => {
    const dms = chromeDms ?? [];
    const labels = personLabels(dms.map((dm) => ({ id: dm.id, displayName: dm.displayName, handle: dm.handle })));
    return dms
      .map((dm, index) => ({ value: dm.id, label: labels[index] }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [chromeDms]);
  const sentinelRef = useInfiniteScroll({
    enabled: query.hasNextPage && !query.isFetching,
    onLoadMore: () => {
      if (!query.isFetching) void query.fetchNextPage();
    },
  });
  const shared = {
    segment,
    setSegment,
    quickFilter: effectiveQuickFilter,
    // The most recent choice wins: picking a quick date drops the specific date.
    setQuickFilter: (filter: QuestQuickFilter) => {
      setQuickFilter(filter);
      setBoardFilters((current) => (current.date ? { ...current, date: '' } : current));
    },
    boardFilters,
    setBoardFilters,
    dmOptions,
    search,
    setSearch,
    total: visibleItems.length,
    hasMore: query.hasNextPage && !query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    sentinelRef,
    liveCount: live.isError ? null : (live.data?.total ?? null),
    dmsAcceptingCount: chrome.isError ? null : (chrome.data?.dmsAcceptingCount ?? null),
    metadataError: live.error ?? chrome.error ?? characters.error,
    retryMetadata: () => {
      void live.refetch();
      void chrome.refetch();
      if (isAuthenticated && me.data) void characters.refetch();
    },
    liveStrip: (live.data?.items ?? []).slice(0, 6).map((quest) => ({
      id: quest.id,
      shortCode: quest.shortCode,
      title: quest.title,
      dmHandle: quest.dmHandle,
      dmName: quest.dmName,
    })),
    canCreate:
      !authority.isError &&
      authority.data?.memberId === me.data?.id &&
      authority.data?.canCreate === true,
    retry: () => {
      void query.refetch();
    },
    isFetching: query.isFetching,
    isBoardMutating: commands.pending,
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
  else if (!visibleItems.length) page = { status: 'empty' };
  else
    page = {
      status: 'ready',
      view: visibleItems.map((quest) => ({
        ...quest,
        card: mapToBoardCardProps(quest, timeZone),
      })),
    };
  return { ...page, ...shared };
}
