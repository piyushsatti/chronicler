import type { AppError } from '../../../errors/types.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { QuestBoardCard, type QuestBoardCardView } from './QuestBoardCard.js';
import styles from './questBoard.module.css';

type Segment = 'Open' | 'Scheduled' | 'Live' | 'All';
const SEGMENTS: Segment[] = ['Open', 'Scheduled', 'Live', 'All'];

type QuestBoardViewProps = {
  segment: Segment;
  setSegment: (segment: Segment) => void;
  columns: 1 | 2;
  total: number | null;
  hasMore: boolean;
  isFetching: boolean;
  loadMore: () => void;
  retry: () => void;
} & (
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: QuestBoardCardView[] }
);

/** Props-only board composition. Data and layout authority arrive from its hook. */
export function QuestBoardView(page: QuestBoardViewProps): React.JSX.Element {
  return (
    <section className={`ctx-tavern ${styles.board}`} aria-labelledby="quest-board-title">
      <header className={styles.header}>
        <p className="type-label">Find a table</p>
        <h1 id="quest-board-title" className="type-display">The Tavern Board</h1>
      </header>
      <div className={styles.filters}>
        <div className="seg" role="tablist" aria-label="Quest board filters">
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
        {page.total !== null && page.status !== 'error' ? (
          <p className="type-caption">{page.segment}: {page.total} {page.total === 1 ? 'quest' : 'quests'}</p>
        ) : null}
      </div>
      {page.status === 'error' ? (
        <ErrorState message={page.error.userMessage}>
          <Button variant="secondary" onClick={page.retry} pending={page.isFetching}>Try again</Button>
        </ErrorState>
      ) : page.status === 'loading' ? (
        <div aria-busy="true" className={styles.loading}>
          <p role="status" className="type-caption">Loading…</p>
          <div className={styles.grid} data-columns={page.columns} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={`card ${styles.skeleton}`} data-el="quest-board-skeleton">
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
          <ul className={styles.grid} data-columns={page.columns} aria-label={`${page.segment} quests`}>
            {page.view.map((quest) => (
              <li key={quest.id}><QuestBoardCard quest={quest} /></li>
            ))}
          </ul>
          {page.hasMore ? (
            <div className={styles.pagination}>
              <Button variant="secondary" onClick={page.loadMore} pending={page.isFetching}>Load more</Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
