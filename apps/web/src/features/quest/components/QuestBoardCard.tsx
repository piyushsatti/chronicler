import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import styles from './questBoard.module.css';

export type QuestBoardCardView = {
  id: string;
  shortCode: string;
  title: string;
  status: string;
  scheduledAt: string;
  slotsMax: number;
  filledCount: number;
  dmName: string | null;
};

function formatSchedule(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

/** Board-owned presentation of selected, already validated view values. */
export function QuestBoardCard({ quest }: { quest: QuestBoardCardView }): React.JSX.Element {
  const schedule = formatSchedule(quest.scheduledAt);
  const titleID = `quest-card-${quest.id}`;
  const detail = `/quests/${quest.shortCode}`;

  return (
    <Card as="article" pad={0} className={styles.card} aria-labelledby={titleID} data-el="boardCard.root" data-status={quest.status}>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div className={styles.badges}>
            <Chip tone="line">{quest.shortCode}</Chip>
            <Chip tone="status">{quest.status}</Chip>
          </div>
          <span className="type-caption">{quest.filledCount}/{quest.slotsMax} seats filled</span>
        </div>
        <h2 id={titleID} className={`type-display ${styles.title}`} data-el="boardCard.title">
          <Link to={detail}>{quest.title}</Link>
        </h2>
        <div className={styles.metadata}>
          {quest.dmName?.trim() ? (
            <p className={styles.dm}>
              <span className="type-label">DM</span>
              <span className="type-title">{quest.dmName}</span>
            </p>
          ) : null}
          {schedule ? (
            <p className={`type-caption ${styles.schedule}`}>
              <span className="type-label">Scheduled</span>
              <time dateTime={quest.scheduledAt}>{schedule}</time>
            </p>
          ) : null}
        </div>
      </div>
      <Card.Footer className={styles.footer}>
        <Link className="type-caption" to={`${detail}/summary`}>Session summaries</Link>
        <Link className="btn btn--secondary" to={detail}>View quest</Link>
      </Card.Footer>
    </Card>
  );
}
