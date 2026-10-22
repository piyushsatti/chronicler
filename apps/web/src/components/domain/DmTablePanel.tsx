import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../primitives/Card.js';
import { ContentRenderer } from '../foundation/ContentRenderer.js';
import { Chip } from '../primitives/Chip.js';
import styles from './DmTablePanel.module.css';

export type DmTablePanelModel = {
  title: string;
  blurb?: string | null;
  tags?: string[];
  body?: string | null;
  status?: string;
  slug?: string;
  isOwner?: boolean;
};

export type DmTablePanelProps = {
  table?: DmTablePanelModel | null;
  isOwner?: boolean;
  showCreateCta?: boolean;
  compact?: boolean;
  children?: ReactNode;
  className?: string;
};

/** Presentational dm_table panel — create CTA, draft chip, blurb/tags/body. */
export function DmTablePanel({
  table,
  isOwner = false,
  showCreateCta = true,
  compact = false,
  children,
  className,
}: DmTablePanelProps): React.JSX.Element | null {
  if (!table) {
    if (!isOwner || !showCreateCta) {
      return children ? (
        <div className={className} data-component="DmTablePanel">
          {children}
        </div>
      ) : null;
    }
    return (
      <Card
        className={className}
        data-component="DmTablePanel"
        data-el="dmTable.createCta"
      >
        <p className="type-body">
          You haven&apos;t written a table page yet — a short blurb + write-up players
          see before requesting a seat.
        </p>
        <Link className="btn btn--primary btn--sm" to="/editor/dm-table">
          Create your table page
        </Link>
      </Card>
    );
  }

  const isDraft = table.status === 'draft';
  const owner = isOwner || table.isOwner;

  return (
    <Card
      className={className}
      data-component="DmTablePanel"
      data-el="dmTable.panel"
      data-compact={compact ? '1' : undefined}
    >
      <div className="row" data-justify="between" data-align="start">
        <div className="stack">
          <h3 className={`${compact ? 'type-title' : 'type-heading'} ${styles.title}`}>
            {table.title}
          </h3>
          {table.blurb ? (
            <p className={`type-body ${styles.blurb}`}>{table.blurb}</p>
          ) : null}
        </div>
        {owner ? (
          <div className="row">
            <Chip tone="line">{isDraft ? 'Draft' : 'Published'}</Chip>
            {table.slug ? (
              <Link
                className="btn btn--secondary btn--sm"
                to={`/editor/dm-table/${table.slug}/edit`}
              >
                Edit
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {table.tags && table.tags.length > 0 ? (
        <Chip.Row>
          {table.tags.map((tag) => (
            <Chip key={tag} tone="line">
              {tag}
            </Chip>
          ))}
        </Chip.Row>
      ) : null}
      {table.body ? <ContentRenderer body={table.body} /> : null}
      {children}
      {table.slug ? (
        <Link className="type-link" to={`/community/dm-table/${table.slug}`}>
          Open table page
        </Link>
      ) : null}
    </Card>
  );
}
