import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useRetainedDocument } from '../hooks/useRetainedDocument.js';

export function ScheduleAliasPage(): React.JSX.Element {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (!params.has('q') && params.has('search'))
    params.set('q', params.get('search') ?? '');
  if (!params.has('day') && params.has('date'))
    params.set('day', params.get('date') ?? '');
  const search = params.toString();
  return (
    <Navigate replace to={`/calendar${search ? `?${search}` : ''}${location.hash}`} />
  );
}

export function GuildAliasPage(): React.JSX.Element {
  const { shortCode } = useParams();
  const location = useLocation();
  const document = useRetainedDocument(shortCode);
  if (!shortCode) {
    const params = new URLSearchParams(location.search);
    if (!params.has('q') && params.has('search'))
      params.set('q', params.get('search') ?? '');
    const search = params.toString();
    return (
      <Navigate replace to={`/codex${search ? `?${search}` : ''}${location.hash}`} />
    );
  }
  if (!document.isError && document.data?.href)
    return (
      <Navigate
        replace
        to={`${document.data.href}${location.search}${location.hash}`}
      />
    );
  return (
    <PageShell title="Guilds" context="tavern">
      <SingleRegionPage page="guilds">
        {document.isError ? (
          <>
            <StatePanel
              status="error"
              error={toAppError(document.error, 'guilds:read')}
            />
            <Button onClick={document.retry}>Try again</Button>
          </>
        ) : document.isPending ? (
          <StatePanel status="loading" />
        ) : (
          <>
            <p className="type-body">
              {document.data
                ? `“${document.data.title}” has no Guild reader destination.`
                : 'This historical Guild link could not be resolved to a current document.'}
            </p>
            <p className="type-body">
              Guild reference material now lives in the Codex. Browse the current
              entries to continue.
            </p>
            <Link className="btn" to="/codex">
              Browse the Codex
            </Link>
          </>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
