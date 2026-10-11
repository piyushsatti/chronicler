import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useLoginPage } from '../hooks/useLoginPage.js';

export function LoginPage({
  notificationsSlot,
}: {
  notificationsSlot?: ReactNode;
}): React.JSX.Element {
  const {
    login,
    loginError,
    logout,
    isAuthenticated,
    displayName,
    canAdmin,
    canVerify,
  } = useLoginPage();

  return (
    <PageShell title={isAuthenticated ? 'Account' : 'Sign in'}>
      <SingleRegionPage page="login">
        {!isAuthenticated ? (
          <div className="stack">
            {loginError ? <StatePanel status="error" error={loginError} /> : null}
            <button type="button" className="btn" onClick={login}>
              Continue with Discord
            </button>
          </div>
        ) : (
          <div className="stack">
            <p className="type-body">Signed in as {displayName}.</p>
            <div className="row">
              <Link className="btn btn-ghost" to="/search">
                Search
              </Link>
              {canAdmin ? (
                <Link className="btn btn-ghost" to="/admin">
                  Admin
                </Link>
              ) : null}
              {canVerify ? (
                <Link className="btn btn-ghost" to="/verify">
                  Verification
                </Link>
              ) : null}
            </div>
            {notificationsSlot}
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
