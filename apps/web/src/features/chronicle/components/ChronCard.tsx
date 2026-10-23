import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { personLabels } from '../../../utils/format.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { summaryCategoryLabel, summaryCategoryMeta } from '../summaryCategory.js';
import styles from './chronCard.module.css';

type ChronCardProps = {
  entry: ChronicleListItemView;
  authorLabel?: string;
};

export function ChronCard({ entry, authorLabel }: ChronCardProps): React.JSX.Element {
  const isDmOnly = entry.visibility === 'dm_only';
  const typeMeta = summaryCategoryMeta(isDmOnly ? 'dm' : entry.category);
  const author = entry.authorHandle
    ? authorLabel ?? personLabels([{ displayName: entry.authorDisplayName, handle: entry.authorHandle }])[0]
    : null;
  const typeColorVars = {
    '--chron-type-color': typeMeta.color,
    '--chron-type-bg': typeMeta.bg,
  } as CSSProperties;

  return (
    <article
      className={styles.entry}
      style={typeColorVars}
      data-entry-kind={isDmOnly || entry.category === 'dm' ? 'dm' : 'session'}
      data-el="chronicles.card"
    >
      <div className={styles.labels}>
        <span className={styles.typeLabel}>{summaryCategoryLabel(isDmOnly ? 'dm' : entry.category)}</span>
        {isDmOnly ? (
          <span className={styles.privacy}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="7" width="9" height="7" rx="1.3" />
              <path d="M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7" />
            </svg>
            DMs only
          </span>
        ) : null}
      </div>
      <h3 className={styles.title}>{entry.title}</h3>
      {entry.excerpt ? <p className={styles.excerpt}>{entry.excerpt}</p> : null}
      <div className={styles.footer}>
        {author ? (
          <span className={styles.author}>
            <Avatar name={author} size="xs" online={false} />
            {author}
          </span>
        ) : <span />}
        <Link
          className={styles.readLink}
          to={`/chronicles/${encodeURIComponent(entry.slug)}`}
          aria-label={`Read entry: ${entry.title}`}
        >
          Read entry <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
