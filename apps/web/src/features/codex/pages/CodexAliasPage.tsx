import { Navigate, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCodexEntryAliasPage } from '../hooks/useCodexEntryAliasPage.js';

export function CodexSlugAliasPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <Navigate to={`/codex/${encodeURIComponent(slug)}`} replace />;
}

export function CodexIdAliasPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const page = useCodexEntryAliasPage(id);
  if (page.status === 'ready') {
    return <Navigate to={`/codex/${encodeURIComponent(page.slug)}`} replace />;
  }
  return (
    <PageShell title="Codex">
      <SingleRegionPage page="codex-entry-alias">
        {page.status === 'error' ? (
          <StatePanel status="error" error={page.error} />
        ) : (
          <StatePanel status="loading" />
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
