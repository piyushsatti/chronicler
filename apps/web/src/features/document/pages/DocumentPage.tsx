import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDocumentPage } from '../hooks/useDocumentPage.js';

const DECLARATION: PageDeclaration = {
  page: 'document',
  regions: [{ role: 'body', priority: 1 }],
};

export function DocumentPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useDocumentPage(slug);

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const doc = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <p className="type-caption">
            {doc.kind}
            {doc.category ? ` · ${doc.category}` : ''}
            {doc.authorHandle ? ` · @${doc.authorHandle}` : ''}
          </p>
          {doc.body ? (
            <div className="card type-body">{doc.body}</div>
          ) : (
            <p className="type-caption">No body available for this viewer.</p>
          )}
        </article>
      ),
    };
  }

  return (
    <PageShell title={page.status === 'ready' ? page.view.title : 'Document'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
