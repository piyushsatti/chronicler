import type { CSSProperties } from 'react';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { handleOnlyName } from '../../../utils/format.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { regionColorVar } from '../regionColor.js';
import { summaryCategoryMeta } from '../summaryCategory.js';
import styles from './chronCard.module.css';

type ChronCardProps = {
  entry: ChronicleListItemView;
  /** Show the entry type chip; hidden when every entry shares one type. */
  showType?: boolean;
};

/** One chronicle entry. The whole card is the link to the entry. */
export function ChronCard({ entry, showType = true }: ChronCardProps): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const when = entry.occurredAt ?? entry.publishedAt;
  const typeMeta = summaryCategoryMeta(entry.category);
  const regionColor = entry.region ? regionColorVar(entry.region) : undefined;
  const dayLabel = entry.gameDate
    ? `${entry.gameDate.eraAbbrev} ${entry.gameDate.year} · ${entry.gameDate.periodName} ${entry.gameDate.day}`
    : entry.gameDay != null
      ? `Game day ${entry.gameDay}`
      : null;
  const author = entry.authorHandle
    ? handleOnlyName(entry.authorHandle)
    : null;

  const typeColorVars = {
    '--chron-type-color': typeMeta.color,
    '--chron-type-bg': typeMeta.bg,
  } as CSSProperties;

  return (
    <Card
      variant="clickable"
      to={`/chronicles/${encodeURIComponent(entry.slug)}`}
      data-el="chronicles.card"
      aria-label={`${entry.title}${dayLabel ? `, ${dayLabel}` : ''}`}
      pad={4}
      className={`stack ${styles.entry}`}
      style={typeColorVars}
    >
      <div className="row" data-gap="2" data-justify="between" data-wrap="1">
        {showType ? (
          <span className={`chip ${styles.typeChip}`}>{typeMeta.label}</span>
        ) : null}
        {when || dayLabel ? (
          <span className="type-caption">{when ? formatDate(when) : dayLabel}</span>
        ) : null}
      </div>

      {entry.title ? (
        <h3 className={`type-title ${styles.title}`}>{entry.title}</h3>
      ) : null}

      {entry.excerpt ? (
        <p className={`type-body ${styles.excerpt}`}>{entry.excerpt}</p>
      ) : null}

      <div className={`row ${styles.footer}`} data-gap="2" data-wrap="1">
        {author ? (
          <>
            <Avatar name={author} size="xs" online={false} />
            <span className="type-caption">{author}</span>
          </>
        ) : null}
        {entry.region ? (
          <span className="chip">
            <span
              className="dot"
              style={{ '--region-color': regionColor } as CSSProperties}
            />
            {entry.region}
          </span>
        ) : null}
        {entry.arc ? <span className="type-caption">{entry.arc}</span> : null}
      </div>
    </Card>
  );
}
