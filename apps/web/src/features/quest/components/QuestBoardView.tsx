import { Link } from 'react-router-dom';
import type { AppError } from '../../../errors/types.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { QuestBoardCard } from './QuestBoardCard.js';
import type {
  QuestBoardItemView,
  QuestBoardCardPropsView,
} from '../adapters/questAdapter.js';
import type { BoardSegment as Segment } from '../hooks/useQuestBoardPage.js';
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
  columns: 1 | 2;
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
    <section
      className={styles.board}
      aria-labelledby="quest-board-title"
      data-el="quests.root"
    >
      <header>
        <div data-el="quests.eyebrow" className="type-label">
          Find a table
        </div>
        <div
          className={`row ${styles.titleRow}`}
          data-wrap="1"
          data-align="center"
          data-justify="between"
        >
          <h1 id="quest-board-title" data-el="quests.title" className="type-display">
            The Tavern Board
          </h1>
          {page.canCreate ? (
            <Link
              data-el="quests.newQuestBtn"
              to="/quests/new"
              className="btn btn--primary primary"
            >
              + New quest
            </Link>
          ) : null}
        </div>
        <div
          data-el="quests.metaRow"
          className={`row ${styles.metaRow}`}
          data-wrap="1"
        >
          {page.openCount !== null ? (
            <span className="type-caption">{page.openCount} quests open</span>
          ) : null}
          {page.dmsAcceptingCount !== null && page.dmsAcceptingCount > 0 ? (
            <>
              <span className="type-caption">·</span>
              <span className="type-caption">
                {page.dmsAcceptingCount} DMs accepting
              </span>
            </>
          ) : null}
          {page.liveCount !== null && page.liveCount > 0 ? (
            <>
              <span className="type-caption">·</span>
              <span className={`row ${styles.liveCount}`}>
                <span className={styles.liveDot} />
                <span className="type-ui">{page.liveCount} sessions live now</span>
              </span>
            </>
          ) : null}
        </div>
      </header>

      {page.liveStrip.length > 0 ? (
        <div
          data-el="quests.liveBand"
          className={`live-band ${styles.liveBand}`}
        >
          <span className="pulse" />
          <span className="type-label">Live</span>
          {page.liveStrip.map((q) => (
            <span key={q.id} className={styles.liveItem}>
              <span className="sep" />
              <button
                type="button"
                className={`det ${styles.liveQuest}`}
                onClick={() => page.onOpenQuest(q.shortCode)}
              >
                <em>{q.dmHandle ?? 'Unknown DM'}</em> · {q.title}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div
        data-el="quests.filters"
        className={`filters ${styles.filters}`}
      >
        <div
          data-el="quests.seg"
          className="seg"
          role="tablist"
          aria-label="Quest board filters"
        >
          {SEGMENTS.map((segment) => (
            <button
              key={segment}
              type="button"
              className={page.segment === segment ? 'seg__opt on' : 'seg__opt'}
              role="tab"
              aria-selected={page.segment === segment}
              data-active={page.segment === segment ? '1' : undefined}
              onClick={() => page.setSegment(segment)}
            >
              {segment}
            </button>
          ))}
        </div>
        <span className="grow" />
        {page.isFetching && page.status !== 'loading' ? (
          <span className="type-caption" role="status" aria-live="polite">
            Updating…
          </span>
        ) : null}
        {page.total !== null && page.status !== 'error' ? (
          <p className="type-caption">
            {page.segment}: {page.total} {page.total === 1 ? 'quest' : 'quests'}
          </p>
        ) : null}
      </div>

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
        <ErrorState message={page.error.userMessage}>
          <Button variant="secondary" onClick={page.retry} pending={page.isFetching}>
            Try again
          </Button>
        </ErrorState>
      ) : page.status === 'loading' ? (
        <div aria-busy="true" className={styles.loading}>
          <p role="status" className="type-caption">
            Loading…
          </p>
          <div className={styles.grid} data-columns={page.columns} aria-hidden="true">
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
          </div>
        </div>
      ) : page.status === 'empty' ? (
        <div data-el="quest-board-empty">
          <StatePanel status="empty" emptyMessage="No quests in this lane." />
        </div>
      ) : (
        <>
          <ul
            data-el="quests.grid"
            className={styles.grid}
            data-columns={page.columns}
            aria-label={`${page.segment} quests`}
          >
            {page.view.map((quest) => {
              const card = quest.card;
              return (
                <li key={quest.id}>
                  <QuestBoardCard
                    code={card.code}
                    title={card.title}
                    description={card.description}
                    status={card.status}
                    region={card.region}
                    dmUsername={card.dmUsername}
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
          </ul>
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
