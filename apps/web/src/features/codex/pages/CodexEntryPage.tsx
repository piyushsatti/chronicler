import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCodexEntryPage } from '../hooks/useCodexEntryPage.js';

const DECLARATION: PageDeclaration = {
  page: 'codex-entry',
  regions: [{ role: 'body', priority: 1 }],
};

export function CodexEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useCodexEntryPage(slug);

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const entry = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <p className="type-caption">
            {entry.category ?? entry.kind} · {entry.backlinkCount} backlinks
          </p>
          {entry.body ? (
            <div className="card type-body">{entry.body}</div>
          ) : (
            <p className="type-caption">No body available for this viewer.</p>
          )}
          <Link className="type-caption" to="/codex">
            Back to directory
          </Link>
        </article>
      ),
    };
  }

  return (
    <PageShell title={page.status === 'ready' ? page.view.title : 'Codex'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
