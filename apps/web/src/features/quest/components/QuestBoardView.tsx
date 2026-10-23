import { Link } from 'react-router-dom';
import type { AppError } from '../../../errors/types.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { SeriesCreateAction } from '../../../components/domain/SeriesCreateAction.js';
import type {
  QuestBoardItemView,
  QuestBoardCardPropsView,
} from '../adapters/questAdapter.js';
import type { BoardSegment as Segment } from '../hooks/useQuestBoardPage.js';
import { personName } from '../../../utils/format.js';
import styles from './questBoard.module.css';

const SEGMENTS: Segment[] = ['Open', 'Scheduled', 'Live', 'All'];

export type LiveStripItem = {
  id: string;
  shortCode: string;
  title: string;
  dmHandle: string | null;
};

type QuestBoardViewProps = {
  segment: Segment;
  setSegment: (segment: Segment) => void;
  total: number | null;
  openCount: number | null;
  liveCount: number | null;
  dmsAcceptingCount: number | null;
  metadataError: unknown;
  retryMetadata: () => void;
  liveStrip: LiveStripItem[];
  canCreate: boolean;
  hasMore: boolean;
  isFetching: boolean;
  isBoardMutating: boolean;
  loadMore: () => void;
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
          {page.liveStrip.map((q) => (
            <span key={q.id} className={styles.liveItem}>
              <span className="sep" />
              <button
                type="button"
                className={`det ${styles.liveQuest}`}
                onClick={() => page.onOpenQuest(q.shortCode)}
              >
                <em>{personName({ handle: q.dmHandle })}</em>, {q.title}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <FilterBar
        label="Quest board filters"
        count={
          page.total !== null && page.status !== 'error'
            ? `${page.total} ${page.total === 1 ? 'quest' : 'quests'}`
            : undefined
        }
      >
        <FilterBar.Group label="Show">
          {SEGMENTS.map((segment) => (
            <Chip
              key={segment}
              selected={page.segment === segment}
              onClick={() => page.setSegment(segment)}
            >
              {segment}
            </Chip>
          ))}
        </FilterBar.Group>
        {page.isFetching && page.status !== 'loading' ? (
          <span className="type-caption" role="status" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </FilterBar>

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
              page.segment === 'All'
                ? 'There are no quests on the board yet.'
                : `No ${page.segment.toLowerCase()} quests right now.`
            }
            action={
              page.segment === 'All' ? undefined : (
                <Button variant="secondary" onClick={() => page.setSegment('All')}>
                  Show all quests
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <CardGrid as="ul" gap={5} aria-label={`${page.segment} quests`}>
            {page.view.map((quest) => {
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
                    dmName={card.dmName}
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
          {page.hasMore ? (
            <div data-el="quests.pagination" className={styles.pagination}>
              <Button
                variant="secondary"
                onClick={page.loadMore}
                pending={page.isFetching}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
