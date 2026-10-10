import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadCodexEntry } from '../adapters/codexAdapter.js';

const DECLARATION: PageDeclaration = {
  page: 'codex-entry',
  regions: [{ role: 'body', priority: 1 }],
};

export function CodexEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: queryKeys.codexEntry(slug),
    queryFn: () => loadCodexEntry(slug),
    enabled: Boolean(slug),
  });

  let regions: PageRegionRenderers;
  if (q.isError) {
    regions = {
      body: () => (
        <StatePanel status="error" error={toAppError(q.error, 'codex:entry')} />
      ),
    };
  } else if (q.isLoading || !q.data) {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const entry = q.data;
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
    <PageShell title={q.data?.title ?? 'Codex'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
