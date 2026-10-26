import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { relativeDate } from '../relativeDate.js';
import styles from './recentChronicleCard.module.css';

export type RecentChronicleCardProps = {
  slug: string;
  title: string;
  author: string | null;
  /** ISO instant or civil date of the session; shown as a relative date. */
  date: string | null;
};

export function RecentChronicleCard({
  slug,
  title,
  author,
  date,
}: RecentChronicleCardProps): React.JSX.Element {
  const when = relativeDate(date);
  return (
    // The whole card is the one link, like every other card (owner item 19).
    <Card
      variant="clickable"
      to={`/chronicles/${encodeURIComponent(slug)}`}
      aria-label={title}
      pad={4}
      className={styles.card}
      data-el="home.recentChronicle"
      data-testid="recent-chronicle-card"
    >
      {/* A heading, not a nested link, so heading navigation still finds each card. */}
      <h3 className={`type-title ${styles.title}`} data-el="home.recentChronicle.link">
        {title}
      </h3>
      <div className={`row ${styles.meta}`} data-justify="between" data-gap="2">
        {author ? (
          <span className={`row type-caption ${styles.author}`} data-gap="2">
            <Avatar name={author} size="xs" online={false} />
            {author}
          </span>
        ) : (
          <span />
        )}
        {when ? <span className="type-caption">{when}</span> : null}
      </div>
    </Card>
  );
}
