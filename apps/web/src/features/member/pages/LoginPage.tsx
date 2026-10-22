import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useLoginPage } from '../hooks/useLoginPage.js';
import styles from './login.module.css';

export function LoginPage({
  notificationsSlot,
}: {
  notificationsSlot?: ReactNode;
}): React.JSX.Element {
  const page = useLoginPage();

  if (!page.isAuthenticated) {
    return (
      <PageShell eyebrow="Members" title="Sign in">
        <SingleRegionPage page="login">
          <Card as="section" className={`stack ${styles.card}`} data-gap="4" aria-label="Sign in">
            {page.redirected ? (
              <p className="type-title" role="status">
                Sign in to continue. You’ll come back to the page you were opening.
              </p>
            ) : null}
            <p className="type-body">
              Chronicler uses the Discord account you play on the server with. Signing in
              lets you sign up for quests, keep your characters and write session
              summaries. Discord shares only your public profile with us, never your
              messages or servers.
            </p>
            {page.loginError ? (
              <StatePanel status="error" error={page.loginError} variant="inline" />
            ) : null}
            <div className="row" data-wrap="1" data-gap="3">
              <Button type="button" variant="primary" onClick={page.login}>
                Continue with Discord
              </Button>
              <Link className="btn btn--ghost" to="/">
                Browse as guest
              </Link>
            </div>
          </Card>
        </SingleRegionPage>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Account" title="Your account">
      <SingleRegionPage page="login">
        <div className="stack" data-gap="5">
          <Card
            as="section"
            className={`stack ${styles.card}`}
            data-gap="3"
            aria-label="Signed in"
          >
            {page.account.status === 'error' ? (
              <StatePanel
                status="error"
                error={page.account.error}
                variant="inline"
                onRetry={page.retryAccount}
              />
            ) : page.account.status === 'loading' ? (
              <Skeleton width="16rem" aria-label="Loading your account" />
            ) : (
              <p className="type-body">
                Signed in as <strong>{page.account.displayName}</strong>.
              </p>
            )}
            <div className="row" data-wrap="1" data-gap="2">
              <Link className="btn btn--secondary" to="/me">
                Your page
              </Link>
              {page.canAdmin ? (
                <Link className="btn btn--ghost" to="/admin">
                  Admin
                </Link>
              ) : null}
              {page.canVerify ? (
                <Link className="btn btn--ghost" to="/verify">
                  Verification
                </Link>
              ) : null}
              <Button type="button" variant="ghost" onClick={page.logout}>
                Sign out
              </Button>
            </div>
          </Card>
          {notificationsSlot}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
