import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useCommunityEntryPage } from '../hooks/useCommunityEntryPage.js';
import { humanizeKey } from '../../../utils/format.js';
import styles from './community.module.css';

const DECLARATION: PageDeclaration = {
  page: 'community-entry',
  regions: [{ role: 'body', priority: 1 }],
};

export function CommunityEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useCommunityEntryPage(slug);
  const { formatDate } = useDateFormatter();
  const back = (
    <Link className={`btn btn--ghost btn--sm ${styles.backLink}`} to="/community">
      ← Community
    </Link>
  );
  const regions: PageRegionRenderers = {
    body: () =>
      page.status === 'error' && page.error.kind === 'not_found' ? (
        <div className={styles.entry}>
          {back}
          <StatePanel
            status="empty"
            emptyMessage="This community post doesn't exist, or it isn't shared with you."
          />
        </div>
      ) : page.status === 'error' ? (
        <div className={styles.entry}>
          {back}
          <StatePanel status="error" error={page.error} />
        </div>
      ) : page.status === 'loading' ? (
        <StatePanel status="loading" />
      ) : (
        <article className={styles.entry}>
          {back}
          <header className="stack" data-gap="3">
            <h1 className="type-display">{page.view.title}</h1>
            <div className={styles.entryMeta}>
              <Chip size="sm" tone="category">
                {page.view.category ? humanizeKey(page.view.category) : 'Community'}
              </Chip>
              {page.view.author ? (
                <Link
                  className="type-caption"
                  to={`/players/@${page.view.author.handle}`}
                >
                  @{page.view.author.handle}
                </Link>
              ) : null}
              {(page.view.publishedAt ?? page.view.updatedAt) ? (
                <span className="type-caption">
                  {page.view.publishedAt ? 'Posted ' : 'Updated '}
                  {formatDate(page.view.publishedAt ?? page.view.updatedAt)}
                </span>
              ) : null}
            </div>
          </header>
          <Card pad={5} className={styles.entryBody}>
            {page.view.effectiveBody ? (
              <ContentRenderer body={page.view.effectiveBody} />
            ) : (
              <p className="type-caption">No body available for this viewer.</p>
            )}
          </Card>
        </article>
      ),
  };
  return (
    <PageShell>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
