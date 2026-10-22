import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useMe } from '../../../hooks/useMe.js';
import { pluralize } from '../../../utils/format.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import styles from './codex.module.css';

export function CodexLinkedDirectoryPage({
  title,
  categoryPrefix,
  eyebrow,
}: {
  title: string;
  categoryPrefix: string;
  eyebrow: string;
}): React.JSX.Element {
  const page = useCodexPage(categoryPrefix);
  const { data: me } = useMe();
  const newHref = `/codex/${encodeURIComponent(categoryPrefix)}/new`;

  let body: React.JSX.Element;
  if (page.status === 'error') {
    body = <StatePanel status="error" error={page.error} />;
  } else if (page.status === 'loading') {
    body = (
      <div className={styles.directoryGrid} aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} height="5.5rem" aria-label={`Loading ${title}`} />
        ))}
      </div>
    );
  } else if (page.status === 'empty') {
    body = (
      <div className={`card ${styles.emptyDirectory}`}>
        <p className="type-title">No {title} in the Codex yet.</p>
        <p className="type-body">
          {me
            ? `Write the first one, or browse the rest of the Codex.`
            : `Entries tagged ${categoryPrefix} will be listed here once they are published.`}
        </p>
        <div className="row" data-wrap="1" data-gap="3" data-justify="center">
          {me ? (
            <Link className="btn btn--primary" to={newHref}>
              New {categoryPrefix} entry
            </Link>
          ) : null}
          <Link className="btn btn--secondary" to="/codex">
            Browse the Codex
          </Link>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={styles.directoryGrid}>
        {page.view.map((entry) => (
          <Card
            key={entry.slug}
            variant="clickable"
            to={`/codex/${entry.slug}`}
            className={styles.directoryCard}
            pad={4}
          >
            <h2 className="type-title">{entry.title}</h2>
            {entry.excerpt ? (
              <p className={`type-caption ${styles.clamp}`}>{entry.excerpt}</p>
            ) : null}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <PageShell>
      <SingleRegionPage page="codex-directory">
        <div className={styles.entryPage}>
          <Link className={`btn btn--ghost btn--sm ${styles.back}`} to="/codex">
            ← Codex
          </Link>
          <header className={styles.entryHeader}>
            <div className="stack" data-gap="2">
              <p className="type-label">{eyebrow}</p>
              <h1 className="type-display">{title}</h1>
              {page.status === 'ready' ? (
                <p className="type-caption">
                  {page.view.length >= (page.total ?? page.view.length)
                    ? pluralize(page.view.length, 'entry', 'entries')
                    : `Showing ${page.view.length} of ${page.total} entries`}
                </p>
              ) : null}
            </div>
            {me && page.status === 'ready' ? (
              <Link className="btn btn--secondary" to={newHref}>
                New {categoryPrefix} entry
              </Link>
            ) : null}
          </header>
          {body}
          {page.status === 'ready' && page.hasMore ? (
            <button
              className={`btn btn--secondary ${styles.back}`}
              type="button"
              disabled={page.isFetching}
              onClick={page.loadMore}
            >
              {page.isFetching ? 'Loading…' : 'Load more entries'}
            </button>
          ) : null}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
