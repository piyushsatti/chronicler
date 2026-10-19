import type { CSSProperties } from 'react';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { regionColorVar } from '../regionColor.js';
import { summaryCategoryMeta } from '../summaryCategory.js';

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

  return (
    <div
      className="row"
      data-el="chronicles.card"
      data-gap="3"
      data-align="start"
      style={{ marginBottom: 'var(--sp-3)' }}
    >
      <div className="stack" data-align="center" style={{ flexShrink: 0, paddingTop: 'var(--sp-4)' }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: typeMeta.color,
            boxShadow: `0 0 0 3px var(--color-bg-panel), 0 0 0 4.5px color-mix(in srgb, ${typeMeta.color} 31%, transparent)`,
            flexShrink: 0,
            zIndex: 1,
          }}
        />
      </div>

      <Card
        variant="clickable"
        data-interactive="1"
        onClick={onClick}
        aria-label={`${typeMeta.label}${dayLabel ? ` — ${dayLabel}` : ''}`}
        pad={4}
        style={{ flex: 1 }}
      >
        <div
          className="row"
          data-gap="2"
          data-justify="between"
          data-wrap="1"
          style={{ marginBottom: 'var(--sp-2)' }}
        >
          <div className="row" data-gap="2" data-wrap="1">
            <span
              className="chip type-code"
              style={{
                color: typeMeta.color,
                background: typeMeta.bg,
                border: `1px solid color-mix(in srgb, ${typeMeta.color} 19%, transparent)`,
              }}
            >
              {typeMeta.label}
            </span>
            {entry.arc ? <span className="type-caption">{entry.arc.toUpperCase()}</span> : null}
          </div>
          {dayLabel ? <span className="type-code">{dayLabel}</span> : null}
        </div>

        <div className="row" data-gap="2" data-wrap="1" style={{ marginBottom: 'var(--sp-2)' }}>
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
          <h3
            className="type-title"
            style={{
              margin: '0 0 var(--sp-2)',
              color: 'var(--color-text)',
            }}
          >
            {entry.title}
          </h3>
        ) : null}

        {entry.tags.length > 0 ? (
          <div className="row" data-wrap="1" style={{ gap: 6, marginBottom: 'var(--sp-2)' }}>
            {entry.tags.map((t) => (
              <span key={t} className="pf-tag" style={{ cursor: 'default' }}>
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {entry.excerpt ? (
          <p
            className="type-body"
            style={{
              margin: '4px 0 0',
              color: 'var(--color-text-2)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {entry.excerpt}
          </p>
        ) : null}

        <div className="row" data-justify="end" style={{ marginTop: 'var(--sp-3)' }}>
          <span className="type-code">Read entry →</span>
        </div>
      </Card>
    </div>
  );
}
