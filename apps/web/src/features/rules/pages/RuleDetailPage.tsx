import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { useRuleDetailPage } from '../hooks/useRuleDetailPage.js';
import type { RuleFamily } from '../adapters/rulesAdapter.js';
import { documentHref } from '../../../utils/documentHref.js';
import { useRulesPage } from '../hooks/useRulesPage.js';
import { handleLabel } from '../../../utils/format.js';
import { Card } from '../../../components/primitives/Card.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import styles from './rules.module.css';

const DECLARATION: PageDeclaration = {
  page: 'rule-detail',
  regions: [{ role: 'body', priority: 1 }],
};

export function RuleDetailPage({ family }: { family: RuleFamily }): React.JSX.Element {
  const { slug, id } = useParams();
  const page = useRuleDetailPage(slug ?? id ?? '', family);
  const hub = useRulesPage();

  const noun = family === 'rulings' ? 'ruling' : 'guide';
  const { formatDate } = useDateFormatter();
  const back = { to: '/rules', label: 'Rules' };
  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    const notFound = page.error.kind === 'not_found';
    regions = {
      body: () => (
        <div className={styles.detail}>
          <PageHeader
            back={back}
            title={
              notFound ? `${noun === 'ruling' ? 'Ruling' : 'Guide'} not found` : 'Rules'
            }
          />
          <StatePanel
            status={notFound ? 'empty' : 'error'}
            error={page.error}
            emptyMessage={`This ${noun} may have been removed, or the link is out of date.`}
          />
        </div>
      ),
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const rule = page.view;
    const author = handleLabel(rule.authorHandle);
    const siblings =
      hub.status === 'ready'
        ? (family === 'rulings' ? hub.view.rulings : hub.view.guides)
            .filter((entry) => entry.id !== rule.id)
            .slice(0, 6)
        : [];
    const ordered =
      hub.status === 'ready'
        ? family === 'rulings'
          ? hub.view.rulings
          : hub.view.guides
        : [];
    const at = ordered.findIndex((entry) => entry.id === rule.id);
    const previous = at > 0 ? ordered[at - 1] : undefined;
    const next = at >= 0 ? ordered[at + 1] : undefined;
    const hubLabel = family === 'rulings' ? 'More rulings' : 'More guides';
    regions = {
      body: () => (
        <article className={styles.detail}>
          <PageHeader
            back={back}
            title={rule.title}
            meta={
              <>
                {author ? <span>by {author}</span> : null}
                {rule.updatedAt ? (
                  <span>Updated {formatDate(rule.updatedAt)}</span>
                ) : null}
              </>
            }
            actions={
              rule.canEdit ? (
                <Link
                  className="btn btn--primary"
                  to={`/rules/${family}/${encodeURIComponent(rule.id)}/edit`}
                >
                  Edit {noun}
                </Link>
              ) : null
            }
          />
          <DetailLayout
            railLabel={hubLabel}
            rail={
              siblings.length > 0 ? (
                <Card as="section" pad={4} className="stack" data-gap="3">
                  <h2 className="type-heading">{hubLabel}</h2>
                  <ul className={styles.related}>
                    {siblings.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          className="type-ui"
                          to={documentHref({ kind: 'rule', ...entry }) ?? '/rules'}
                        >
                          {entry.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : undefined
            }
          >
            <DetailLayout.Reading>
              <Card pad={5} className={styles.detailBody}>
                {rule.body ? (
                  <ContentRenderer body={rule.body} className={styles.detailProse} />
                ) : (
                  <p className="type-caption">No body available for this viewer.</p>
                )}
              </Card>
              {previous || next ? (
                <nav className={styles.pager} aria-label={`More ${family}`}>
                  {previous ? (
                    <Link
                      className="btn btn--ghost"
                      to={documentHref({ kind: 'rule', ...previous }) ?? '/rules'}
                    >
                      Previous: {previous.title}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <Link
                      className="btn btn--ghost"
                      to={documentHref({ kind: 'rule', ...next }) ?? '/rules'}
                    >
                      Next: {next.title}
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </DetailLayout.Reading>
          </DetailLayout>
        </article>
      ),
    };
  }

  return (
    <PageShell>
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
