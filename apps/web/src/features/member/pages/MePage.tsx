import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMe } from '../../../hooks/useMe.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';

export function MePage(): React.JSX.Element {
  const { isAuthenticated, logout } = useAuth();
  const meQ = useMe();

  if (!isAuthenticated) {
    return (
      <PageShell>
        <StatePanel status="empty" emptyMessage="Sign in to view your account." />
        <Link className="btn" to="/login">
          Log in
        </Link>
      </PageShell>
    );
  }

  if (meQ.isError) {
    return (
      <PageShell>
        <StatePanel status="error" error={toAppError(meQ.error, 'me:page')} />
      </PageShell>
    );
  }

  if (meQ.isLoading || !meQ.data) {
    return (
      <PageShell>
        <StatePanel status="loading" />
      </PageShell>
    );
  }

  const me = meQ.data;
  return (
    <PageShell>
      <div className="stack">
        <h1 className="type-display">{me.displayName ?? me.handle}</h1>
        <p className="type-caption">{me.handle}</p>
        <div className="row">
          <Link className="btn btn-ghost" to="/characters">
            Characters
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </div>
    </PageShell>
  );
}
