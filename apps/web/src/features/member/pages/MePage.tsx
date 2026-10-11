import { Link } from 'react-router-dom';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMe } from '../../../hooks/useMe.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';

function MeBody(): React.JSX.Element {
  const { logout } = useAuth();
  const meQ = useMe();

  if (meQ.isError) {
    return (
      <PageShell>
        <SingleRegionPage page="me">
          <StatePanel status="error" error={toAppError(meQ.error, 'me:page')} />
        </SingleRegionPage>
      </PageShell>
    );
  }

  if (meQ.isLoading || !meQ.data) {
    return (
      <PageShell>
        <SingleRegionPage page="me">
          <StatePanel status="loading" />
        </SingleRegionPage>
      </PageShell>
    );
  }

  const me = meQ.data;
  return (
    <PageShell>
      <SingleRegionPage page="me">
        <div className="stack">
          <h1 className="type-display">{me.displayName ?? me.handle}</h1>
          <p className="type-caption">{me.handle}</p>
          <div className="row">
            <Link className="btn btn-ghost" to="/characters">
              Characters
            </Link>
            <Link className="btn btn-ghost" to="/me/personalize">
              Personalize
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

export function MePage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <MeBody />
    </ProtectedRoute>
  );
}
