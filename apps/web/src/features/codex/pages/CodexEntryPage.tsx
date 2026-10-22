import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { codexCategoryHeading } from '../../../utils/codexCategories.js';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import { useCodexBacklinks } from '../hooks/useCodexBacklinks.js';
import { useCodexEntryPage } from '../hooks/useCodexEntryPage.js';
import styles from './codex.module.css';

const DECLARATION: PageDeclaration = {
  page: 'codex-entry',
  regions: [{ role: 'body', priority: 1 }],
};

function Backlinks({
  links,
  count,
}: {
  links: { documentId: string; relation: string }[];
  count: number;
}): React.JSX.Element {
  const rows = useCodexBacklinks(links);
  const visible = rows.filter((row) => row.status !== 'hidden');
  return (
    <Card as="section" pad={4} className={styles.backlinks} aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading" className="type-label">
        Linked from
      </h2>
      {count === 0 || (links.length > 0 && visible.length === 0) ? (
        <p className="type-caption">Nothing links here yet.</p>
      ) : (
        <ul className={styles.backlinkList}>
          {visible.map((row) =>
            row.status === 'loading' ? (
              <li key={row.key}>
                <Skeleton height="1.25rem" aria-label="Loading linked entry" />
              </li>
            ) : row.status === 'ready' ? (
              <li key={row.key} className={styles.backlink}>
                {row.view.href ? (
                  <Link className={`type-title ${styles.backlinkTitle}`} to={row.view.href}>
                    {row.view.title}
                  </Link>
                ) : (
                  <span className="type-title">{row.view.title}</span>
                )}
                <span className="type-caption">
                  {row.view.category ?? humanizeKey(row.view.kind)} ·{' '}
                  {humanizeKey(row.relation).toLowerCase()}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {count > links.length ? (
        <p className="type-caption">
          Showing {links.length} of {pluralize(count, 'linking entry', 'linking entries')}.
        </p>
      ) : null}
    </Card>
  );
}

export function CodexEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useCodexEntryPage(slug);
  const { formatDate } = useDateFormatter();
  const back = (
    <Link className={`btn btn--ghost btn--sm ${styles.back}`} to="/codex">
      ← Codex
    </Link>
  );

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => (
        <div className={styles.entryPage}>
          {back}
          <StatePanel status="error" error={page.error} />
          {page.error.kind === 'not_found' ? (
            <Link className={`btn btn--secondary ${styles.back}`} to="/codex">
              Browse the Codex
            </Link>
          ) : null}
        </div>
      ),
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const entry = page.view;
    const categoryLabel = entry.category ?? humanizeKey(entry.kind);
    regions = {
      body: () => (
        <div className={styles.entryPage}>
          {back}
          <header className={styles.entryHeader}>
            <div className="stack" data-gap="3">
              {entry.category ? (
                <Link
                  className={`chip ${styles.categoryChip}`}
                  data-tone="category"
                  to={`/codex?category=${encodeURIComponent(entry.category)}`}
                  aria-label={`More ${codexCategoryHeading(entry.category)}`}
                >
                  {categoryLabel}
                </Link>
              ) : (
                <span className="chip" data-tone="category">
                  {categoryLabel}
                </span>
              )}
              <h1 className="type-display">{entry.title}</h1>
              <p className="type-caption">
                {entry.backlinkCount === 0
                  ? 'Nothing links here yet'
                  : `Linked from ${pluralize(entry.backlinkCount, 'entry', 'entries')}`}
                {entry.authorHandle ? ` · by @${entry.authorHandle}` : ''}
                {entry.updatedAt ? ` · updated ${formatDate(entry.updatedAt)}` : ''}
              </p>
            </div>
            {entry.canEdit ? (
              <Link className="btn btn--secondary" to={`/codex/${entry.id}/edit`}>
                Edit entry
              </Link>
            ) : null}
          </header>
          <div className={styles.entryLayout}>
            <Card as="article" pad={5} className={styles.entryBody}>
              {entry.body ? (
                <ContentRenderer body={entry.body} />
              ) : (
                <p className="type-caption">No body available for this viewer.</p>
              )}
            </Card>
            <Backlinks links={entry.backlinks} count={entry.backlinkCount} />
          </div>
        </div>
      ),
    };
  }

  return (
    <PageShell>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
