import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useRuleDetailPage } from '../hooks/useRuleDetailPage.js';
import type { RuleFamily } from '../adapters/rulesAdapter.js';
import { humanizeKey } from '../../../utils/format.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import styles from './rules.module.css';

const DECLARATION: PageDeclaration = {
  page: 'rule-detail',
  regions: [{ role: 'body', priority: 1 }],
};

export function RuleDetailPage({ family }: { family: RuleFamily }): React.JSX.Element {
  const { slug, id } = useParams();
  const page = useRuleDetailPage(slug ?? id ?? '', family);

  const noun = family === 'rulings' ? 'ruling' : 'guide';
  const { formatDate } = useDateFormatter();
  const back = (
    <Link className={`btn btn--ghost btn--sm ${styles.back}`} to="/rules">
      ← Rules
    </Link>
  );
  let regions: PageRegionRenderers;
  if (page.status === 'error' && page.error.kind === 'not_found') {
    regions = {
      body: () => (
        <EmptyState
          kind="not-found"
          className="card stack"
          message={`There is no ${noun} at this address.`}
        >
          <Link className={`btn btn--secondary ${styles.back}`} to="/rules">
            Back to Rules
          </Link>
        </EmptyState>
      ),
    };
  } else if (page.status === 'error') {
    regions = {
      body: () => (
        <div className={styles.detail}>
          {back}
          <StatePanel status="error" error={page.error} />
        </div>
      ),
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const rule = page.view;
    regions = {
      body: () => (
        <article className={styles.detail}>
          {back}
          <header className={styles.detailHeader}>
            <div className="stack" data-gap="3">
              <div className={styles.detailChips}>
                <Chip size="sm" tone="category">
                  {rule.isRuling ? 'Ruling' : 'Guide'}
                </Chip>
                {rule.category && !rule.isRuling && rule.category.toLowerCase() !== 'guide' ? (
                  <Chip size="sm" tone="line">
                    {humanizeKey(rule.category)}
                  </Chip>
                ) : null}
              </div>
              <h1 className="type-display">{rule.title}</h1>
              {rule.authorHandle || rule.updatedAt ? (
                <p className={`type-body ${styles.detailMeta}`}>
                  {[
                    rule.authorHandle ? `by @${rule.authorHandle}` : null,
                    rule.updatedAt ? `updated ${formatDate(rule.updatedAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
            {rule.canEdit ? (
              <Link
                className="btn btn--secondary"
                to={`/rules/${family}/${encodeURIComponent(rule.id)}/edit`}
              >
                Edit {noun}
              </Link>
            ) : null}
          </header>
          <Card pad={5} className={styles.detailBody}>
            {rule.body ? (
              <ContentRenderer body={rule.body} className={styles.detailProse} />
            ) : (
              <p className="type-caption">No body available for this viewer.</p>
            )}
          </Card>
        </article>
      ),
    };
  }

  return (
    <PageShell
      title={
        page.status === 'error' && page.error.kind === 'not_found'
          ? `${noun === 'ruling' ? 'Ruling' : 'Guide'} not found`
          : undefined
      }
    >
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}

export function GuideDetailPage(): React.JSX.Element {
  return <RuleDetailPage family="guides" />;
}

export function RulingDetailPage(): React.JSX.Element {
  return <RuleDetailPage family="rulings" />;
}
