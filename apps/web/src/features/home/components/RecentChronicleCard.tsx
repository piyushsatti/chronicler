import { Link } from 'react-router-dom';
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
    <Card as="article" pad={4} data-el="home.recentChronicle" data-testid="recent-chronicle-card">
      <h3 className={`type-title ${styles.title}`}>
        <Link
          className={styles.link}
          to={`/chronicles/${encodeURIComponent(slug)}`}
          data-el="home.recentChronicle.link"
        >
          {title}
        </Link>
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
