import { Link } from 'react-router-dom';
import { useState, type RefObject } from 'react';
import type { AppError } from '../../../errors/types.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Popover } from '../../../components/primitives/Popover.js';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { SeriesCreateAction } from '../../../components/domain/SeriesCreateAction.js';
import type {
  QuestBoardItemView,
  QuestBoardCardPropsView,
} from '../adapters/questAdapter.js';
import {
  NO_BOARD_FILTERS,
  type BoardSegment as Segment,
  type QuestBoardFilters,
  type QuestQuickFilter,
} from '../hooks/useQuestBoardPage.js';
import { personLabels } from '../../../utils/format.js';
import styles from './questBoard.module.css';

const SEGMENTS = [
  { value: 'Open', label: 'Open' },
  { value: 'Live', label: 'Live' },
  { value: 'All', label: 'All' },
] as const;
const QUICK_FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'Today', label: 'Today' },
  { value: 'Tomorrow', label: 'Tomorrow' },
  { value: 'This week', label: 'This week' },
] as const;

export type LiveStripItem = {
  id: string;
  shortCode: string;
  title: string;
  dmHandle: string | null;
  dmName: string | null;
};

export type QuestDmOption = { value: string; label: string };

type QuestBoardFilterPopoverProps = {
  filters: QuestBoardFilters;
  dmOptions: readonly QuestDmOption[];
  onApply: (filters: QuestBoardFilters) => void;
};

/** Filter button and popover for what the toolbar cannot say: one DM, one specific date. */
function QuestBoardFilterPopover({
  filters,
  dmOptions,
  onApply,
}: QuestBoardFilterPopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QuestBoardFilters>(filters);
  const activeCount = (filters.dmId ? 1 : 0) + (filters.date ? 1 : 0);
  const apply = (next: QuestBoardFilters) => {
    onApply(next);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Each open starts from what is applied; abandoned edits do not linger.
        if (next) setDraft(filters);
        setOpen(next);
      }}
      className={styles.filterPanel}
      ariaLabel="Filter quests"
      trigger={
        <span
          className={styles.filterButton}
          data-el="quests.filterBtn"
          data-active={activeCount > 0 || undefined}
          data-open={open || undefined}
        >
          <span>Filter</span>
          {activeCount > 0 ? (
            <>
              <span className={styles.filterBadge} aria-hidden="true">
                {activeCount}
              </span>
              <span className={styles.srOnly}>{activeCount} active</span>
            </>
          ) : null}
        </span>
      }
    >
      <form
        className={styles.filterForm}
        data-el="quests.filterPanel"
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        <h2 className={styles.filterHeading}>Filter quests</h2>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>DM</span>
          <select
            className={styles.filterControl}
            data-el="quests.filterDm"
            value={draft.dmId}
            onChange={(event) => setDraft({ ...draft, dmId: event.target.value })}
          >
            <option value="">Any DM</option>
            {dmOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Date</span>
          <input
            type="date"
            className={styles.filterControl}
            data-el="quests.filterDate"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </label>
        <div className={styles.filterActions}>
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(NO_BOARD_FILTERS);
              apply(NO_BOARD_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </Popover>
  );
}

type QuestBoardViewProps = {
  segment: Segment;
  setSegment: (segment: Segment) => void;
  quickFilter: QuestQuickFilter;
  setQuickFilter: (filter: QuestQuickFilter) => void;
  boardFilters: QuestBoardFilters;
  setBoardFilters: (filters: QuestBoardFilters) => void;
  dmOptions: readonly QuestDmOption[];
  search: string;
  setSearch: (search: string) => void;
  total: number | null;
  liveCount: number | null;
  dmsAcceptingCount: number | null;
  metadataError: unknown;
  retryMetadata: () => void;
  liveStrip: LiveStripItem[];
  canCreate: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  isFetching: boolean;
  isBoardMutating: boolean;
  retry: () => void;
  onOpenQuest: (shortCode: string) => void;
  onSignUp: (quest: QuestBoardItemView) => void;
  onWithdraw: (quest: QuestBoardItemView) => void;
  isMine: (quest: QuestBoardItemView) => boolean;
  actionError: AppError | null;
} & (
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      view: Array<QuestBoardItemView & { card: QuestBoardCardPropsView }>;
    }
);

/** Props-only board composition. Data and layout authority arrive from its hook. */
export function QuestBoardView(page: QuestBoardViewProps): React.JSX.Element {
  const peopleLabels = personLabels([
    ...page.liveStrip.map((quest) => ({
      displayName: quest.dmName,
      handle: quest.dmHandle,
    })),
    ...(page.status === 'ready'
      ? page.view.map((quest) => ({
          displayName: quest.dmName,
          handle: quest.dmHandle,
        }))
      : []),
  ]);
  const filtersActive = page.boardFilters.dmId !== '' || page.boardFilters.date !== '';
  const liveDmLabels = peopleLabels.slice(0, page.liveStrip.length);
  const dmLabels = peopleLabels.slice(page.liveStrip.length);
  return (
    <section className={styles.board} aria-label="Quest board" data-el="quests.root">
      <PageHeader
        title="Quests"
        lede="Open tables, upcoming sessions and the ones running now."
        actions={
          <>
            <SeriesCreateAction />
            {page.canCreate ? (
              <Link
                data-el="quests.newQuestBtn"
                to="/quests/new"
                className="btn btn--primary primary"
              >
                New quest
              </Link>
            ) : null}
          </>
        }
        meta={
          (page.dmsAcceptingCount !== null && page.dmsAcceptingCount > 0) ||
          (page.liveCount !== null && page.liveCount > 0) ? (
            <span data-el="quests.metaRow" className={`row ${styles.metaRow}`}>
              {page.dmsAcceptingCount !== null && page.dmsAcceptingCount > 0 ? (
                <Chip size="sm" tone="line">
                  {page.dmsAcceptingCount} DMs accepting
                </Chip>
              ) : null}
              {page.liveCount !== null && page.liveCount > 0 ? (
                <span className={`row ${styles.liveCount}`}>
                  <span className={styles.liveDot} />
                  <span>{page.liveCount} sessions live now</span>
                </span>
              ) : null}
            </span>
          ) : null
        }
      />

      {page.liveStrip.length > 0 ? (
        <div data-el="quests.liveBand" className={`live-band ${styles.liveBand}`}>
          <span className="pulse" />
          <span className="type-label">Live now</span>
          {page.liveStrip.map((q, index) => (
            <span key={q.id} className={styles.liveItem}>
              <span className="sep" />
              <button
                type="button"
                className={`det ${styles.liveQuest}`}
                onClick={() => page.onOpenQuest(q.shortCode)}
              >
                <em>{liveDmLabels[index]}</em>, {q.title}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <PageToolbar
        label="Quest filters"
        segments={
          <PageToolbar.Segments
            aria-label="Quest status"
            options={SEGMENTS}
            value={page.segment}
            onValueChange={page.setSegment}
          />
        }
        quickFilters={
          <PageToolbar.Segments
            aria-label="Quest date"
            size="sm"
            options={QUICK_FILTERS}
            value={page.quickFilter}
            onValueChange={page.setQuickFilter}
          />
        }
        count={
          page.total !== null && page.status !== 'error'
            ? page.hasMore
              ? `${page.total} shown`
              : `${page.total} ${page.total === 1 ? 'quest' : 'quests'}`
            : undefined
        }
        actions={
          <>
            <PageToolbar.Search
              label="Search quests"
              value={page.search}
              onValueChange={page.setSearch}
              placeholder="Search quests"
            />
            <QuestBoardFilterPopover
              filters={page.boardFilters}
              dmOptions={page.dmOptions}
              onApply={page.setBoardFilters}
            />
            {page.isFetching && page.status !== 'loading' ? (
              <span className="type-caption" role="status" aria-live="polite">
                Updating…
              </span>
            ) : null}
          </>
        }
      />

      {page.actionError ? <StatePanel status="error" error={page.actionError} /> : null}
      {page.metadataError ? (
        <div className="stack">
          <p className="type-caption">
            Some board totals or your participation could not be loaded.
          </p>
          <Button variant="secondary" onClick={page.retryMetadata}>
            Retry board details
          </Button>
        </div>
      ) : null}
      {page.status === 'error' ? (
        <StatePanel status="error" error={page.error} onRetry={page.retry} />
      ) : page.status === 'loading' ? (
        <div aria-busy="true" className={styles.loading}>
          <p role="status" className="type-caption">
            Loading…
          </p>
          <CardGrid gap={5} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={`card ${styles.skeleton}`}
                data-el="quest-board-skeleton"
              >
                <span className={styles.skeletonCode} />
                <span className={styles.skeletonTitle} />
                <span className={styles.skeletonText} />
                <span className={styles.skeletonText} />
              </div>
            ))}
          </CardGrid>
        </div>
      ) : page.status === 'empty' ? (
        <div data-el="quest-board-empty">
          <StatePanel
            status="empty"
            title="No quests here"
            emptyMessage={
              page.quickFilter !== 'All' || filtersActive || page.search.trim()
                ? 'No quests match these filters.'
                : page.segment === 'All'
                ? 'There are no quests on the board yet.'
                : `No ${page.segment.toLowerCase()} quests right now.`
            }
            action={
              page.segment !== 'All' ||
              page.quickFilter !== 'All' ||
              filtersActive ||
              page.search.trim() ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    page.setSegment('All');
                    page.setQuickFilter('All');
                    page.setBoardFilters(NO_BOARD_FILTERS);
                    page.setSearch('');
                  }}
                >
                  Show all quests
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <CardGrid as="ul" gap={5} aria-label={`${page.segment} quests`}>
            {page.view.map((quest, index) => {
              const card = quest.card;
              return (
                <li key={quest.id} className={styles.cardItem}>
                  <QuestCard
                    code={card.code}
                    title={card.title}
                    description={card.description}
                    status={card.status}
                    region={card.region}
                    dmUsername={card.dmUsername}
                    dmName={dmLabels[index]}
                    party={card.party}
                    waitlistCount={card.waitlistCount}
                    totalSlots={card.totalSlots}
                    when={card.when}
                    mine={page.isMine(quest)}
                    isMutating={page.isBoardMutating}
                    onSignUpClick={() => page.onSignUp(quest)}
                    onWithdrawConfirm={() => page.onWithdraw(quest)}
                    onOpen={() => page.onOpenQuest(quest.shortCode)}
                  />
                </li>
              );
            })}
          </CardGrid>
      )}
      {page.hasMore ? <div ref={page.sentinelRef} aria-hidden="true" /> : null}
      {page.isFetchingNextPage ? (
        <p className="type-caption" role="status" aria-live="polite">
          Loading more quests…
        </p>
      ) : null}
    </section>
  );
}
