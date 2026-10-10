import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useRuleDetailPage } from '../hooks/useRuleDetailPage.js';

const DECLARATION: PageDeclaration = {
  page: 'rule-detail',
  regions: [{ role: 'body', priority: 1 }],
};

export function RuleDetailPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useRuleDetailPage(slug);

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const rule = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <Link className="type-caption" to="/rules">
            ← Rules
          </Link>
          <p className="type-caption">
            {rule.isRuling ? 'Ruling' : 'Guide'}
            {rule.category ? ` · ${rule.category}` : ''}
            {rule.authorHandle ? ` · @${rule.authorHandle}` : ''}
          </p>
          {rule.body ? (
            <div className="card type-body">{rule.body}</div>
          ) : (
            <p className="type-caption">No body available for this viewer.</p>
          )}
        </article>
      ),
    };
  }

  return (
    <PageShell title={page.status === 'ready' ? page.view.title : 'Rule'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
