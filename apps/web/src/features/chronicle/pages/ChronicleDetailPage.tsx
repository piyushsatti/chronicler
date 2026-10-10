import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useChronicleDetailPage } from '../hooks/useChronicleDetailPage.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicle-detail',
  regions: [{ role: 'body', priority: 1 }],
};

export function ChronicleDetailPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const page = useChronicleDetailPage(id);

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const chronicle = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <Link className="type-caption" to="/chronicles">
            ← All chronicles
          </Link>
          <p className="type-caption">
            {chronicle.category ?? 'summary'}
            {chronicle.authorHandle ? ` · @${chronicle.authorHandle}` : ''}
          </p>
          {chronicle.body ? (
            <div className="card type-body">{chronicle.body}</div>
          ) : (
            <p className="type-caption">No body available for this viewer.</p>
          )}
        </article>
      ),
    };
  }

  return (
    <PageShell title={page.status === 'ready' ? page.view.title : 'Chronicle'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
