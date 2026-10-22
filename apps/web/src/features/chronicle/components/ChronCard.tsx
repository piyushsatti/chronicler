import type { CSSProperties } from 'react';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { regionColorVar } from '../regionColor.js';
import { summaryCategoryMeta } from '../summaryCategory.js';
import styles from './chronCard.module.css';

type ChronCardProps = {
  entry: ChronicleListItemView;
  onClick: () => void;
};

export function ChronCard({ entry, onClick }: ChronCardProps): React.JSX.Element {
  const typeMeta = summaryCategoryMeta(entry.category);
  const regionColor = entry.region ? regionColorVar(entry.region) : undefined;
  const dayLabel = entry.gameDate
    ? `${entry.gameDate.eraAbbrev} ${entry.gameDate.year} · ${entry.gameDate.periodName} ${entry.gameDate.day}`
    : entry.gameDay != null
      ? `Game day ${entry.gameDay}`
      : null;

  const typeColorVars = {
    '--chron-type-color': typeMeta.color,
    '--chron-type-bg': typeMeta.bg,
  } as CSSProperties;

  return (
    <div
      className={`row ${styles.entry}`}
      data-el="chronicles.card"
      data-gap="3"
      data-align="start"
      style={typeColorVars}
    >
      <div
        className={`stack ${styles.markerColumn}`}
        data-align="center"
        data-shrink="0"
      >
        <div className={styles.marker} />
      </div>

      <Card
        variant="clickable"
        data-interactive="1"
        onClick={onClick}
        aria-label={`${typeMeta.label}${dayLabel ? ` — ${dayLabel}` : ''}`}
        pad={4}
        className="grow"
      >
        <div
          className={`row ${styles.section}`}
          data-gap="2"
          data-justify="between"
          data-wrap="1"
        >
          <div className="row" data-gap="2" data-wrap="1">
            <span className={`chip type-code ${styles.typeChip}`}>
              {typeMeta.label}
            </span>
            {entry.arc ? <span className="type-caption">{entry.arc.toUpperCase()}</span> : null}
          </div>
          {dayLabel ? <span className="type-code">{dayLabel}</span> : null}
        </div>

        <div className={`row ${styles.section}`} data-gap="2" data-wrap="1">
          {entry.authorHandle ? (
            <>
              <Avatar name={entry.authorHandle} size="xs" online={false} />
              <span className="type-caption">{entry.authorHandle}</span>
            </>
          ) : null}

          {entry.region ? (
            <>
              <span className="type-caption">·</span>
              <span className="chip">
                <span
                  className="dot"
                  style={{ '--region-color': regionColor } as CSSProperties}
                />
                {entry.region}
              </span>
            </>
          ) : null}
        </div>

        {entry.title ? (
          <h3 className={`type-title ${styles.title}`}>
            {entry.title}
          </h3>
        ) : null}

        {entry.tags.length > 0 ? (
          <div className={`row ${styles.tags} ${styles.section}`} data-wrap="1">
            {entry.tags.map((t) => (
              <span key={t} className={`pf-tag ${styles.tag}`}>
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {entry.excerpt ? (
          <p className={`type-body ${styles.excerpt}`}>
            {entry.excerpt}
          </p>
        ) : null}

        <div className={`row ${styles.footer}`} data-justify="end">
          <span className="type-code">Read entry →</span>
        </div>
      </Card>
    </div>
  );
}
