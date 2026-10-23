import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import { codexCategoryHeading } from '../../../utils/codexCategories.js';
import { humanizeKey, personLabels, pluralize } from '../../../utils/format.js';
import { useCodexBacklinks } from '../hooks/useCodexBacklinks.js';
import { useCodexEntryPage } from '../hooks/useCodexEntryPage.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
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
}): React.JSX.Element | null {
  const rows = useCodexBacklinks(links);
  const visible = rows.filter((row) => row.status !== 'hidden');
  // Nothing links here: say nothing instead of an empty card.
  if (count === 0 || (links.length > 0 && visible.length === 0)) return null;
  return (
    <Card
      as="section"
      pad={4}
      className={styles.backlinks}
      aria-labelledby="backlinks-heading"
    >
      <h2 id="backlinks-heading" className="type-heading">
        Linked from
      </h2>
      {
        <ul className={styles.backlinkList}>
          {visible.map((row) =>
            row.status === 'loading' ? (
              <li key={row.key}>
                <Skeleton height="1.25rem" aria-label="Loading linked entry" />
              </li>
            ) : row.status === 'ready' ? (
              <li key={row.key} className={styles.backlink}>
                {row.view.href ? (
                  <Link
                    className={`type-title ${styles.backlinkTitle}`}
                    to={row.view.href}
                  >
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
      }
      {count > links.length ? (
        <p className="type-caption">
          Showing {links.length} of{' '}
          {pluralize(count, 'linking entry', 'linking entries')}.
        </p>
      ) : null}
    </Card>
  );
}

/** Other entries filed under the same category, so the rail is never empty. */
function MoreInCategory({
  category,
  currentSlug,
}: {
  category: string;
  currentSlug: string;
}): React.JSX.Element | null {
  const page = useCodexPage(category);
  if (page.status !== 'ready') return null;
  const related = page.view.filter((entry) => entry.slug !== currentSlug).slice(0, 6);
  if (related.length === 0) return null;
  return (
    <Card
      as="section"
      pad={4}
      className={styles.backlinks}
      aria-labelledby="more-heading"
    >
      <h2 id="more-heading" className="type-heading">
        More in {codexCategoryHeading(category)}
      </h2>
      <ul className={styles.backlinkList}>
        {related.map((entry) => (
          <li key={entry.id} className={styles.backlink}>
            <Link
              className={`type-ui ${styles.backlinkTitle}`}
              to={`/codex/${entry.slug}`}
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        className="type-caption"
        to={`/codex?category=${encodeURIComponent(category)}`}
      >
        See all {codexCategoryHeading(category)}
      </Link>
    </Card>
  );
}

export function CodexEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useCodexEntryPage(slug);
  const authorHandle = page.status === 'ready' ? page.view.authorHandle ?? '' : '';
  const authorProfile = useMemberProfile(authorHandle);
  const { formatDate } = useDateFormatter();
  const back = { to: '/codex', label: 'Codex' };

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => (
        <div className={styles.entryPage}>
          <PageHeader back={back} title="Codex entry" />
          <StatePanel
            status="error"
            title={page.error.kind === 'not_found' ? 'Entry not found' : undefined}
            error={page.error}
            action={
              page.error.kind === 'not_found' ? (
                <Link className="btn btn--secondary" to="/codex">
                  Browse the Codex
                </Link>
              ) : undefined
            }
          />
        </div>
      ),
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const entry = page.view;
    const categoryLabel = entry.category ?? humanizeKey(entry.kind);
    const author = entry.authorHandle
      ? personLabels([{ displayName: authorProfile.data?.member.displayName, handle: entry.authorHandle }])[0]
      : null;
    regions = {
      body: () => (
        <div className={styles.entryPage}>
          <PageHeader
            back={back}
            title={entry.title}
            meta={
              <>
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
                {entry.backlinkCount > 0 ? (
                  <span>
                    Linked from {pluralize(entry.backlinkCount, 'entry', 'entries')}
                  </span>
                ) : null}
                {author ? <span>by {author}</span> : null}
                {entry.updatedAt ? (
                  <span>Updated {formatDate(entry.updatedAt)}</span>
                ) : null}
              </>
            }
            actions={
              <>
                {entry.category === 'Locations' ? (
                  <Link className="btn btn--secondary" to="/map">
                    View on map
                  </Link>
                ) : null}
                {entry.canEdit ? (
                  <Link className="btn btn--primary" to={`/codex/${entry.id}/edit`}>
                    Edit entry
                  </Link>
                ) : null}
              </>
            }
          />
          <DetailLayout
            rail={
              <div className={styles.entryPage}>
                <Backlinks links={entry.backlinks} count={entry.backlinkCount} />
                {entry.category ? (
                  <MoreInCategory category={entry.category} currentSlug={entry.slug} />
                ) : null}
              </div>
            }
            railLabel="Linked entries"
          >
            <DetailLayout.Reading>
              <Card as="article" pad={5} className={styles.entryBody}>
                {entry.body ? (
                  <ContentRenderer body={entry.body} />
                ) : (
                  <p className="type-caption">No body available for this viewer.</p>
                )}
              </Card>
            </DetailLayout.Reading>
          </DetailLayout>
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
