import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadDocument } from '../adapters/documentAdapter.js';

const DECLARATION: PageDeclaration = {
  page: 'document',
  regions: [{ role: 'body', priority: 1 }],
};

export function DocumentPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: queryKeys.document(slug),
    queryFn: () => loadDocument(slug),
    enabled: Boolean(slug),
  });

  let regions: PageRegionRenderers;
  if (q.isError) {
    regions = {
      body: () => (
        <StatePanel
          status="error"
          error={toAppError(q.error, 'document:page')}
        />
      ),
    };
  } else if (q.isLoading || !q.data) {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const doc = q.data;
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
    <PageShell title={q.data?.title ?? 'Document'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
