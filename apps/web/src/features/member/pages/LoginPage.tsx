import { Link, Navigate } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { useLoginPage } from '../hooks/useLoginPage.js';
import styles from './login.module.css';

export function LoginPage(): React.JSX.Element {
  const page = useLoginPage();

  // D-login: /me is the one account hub, so a signed-in visit to /login goes there.
  if (page.isAuthenticated) return <Navigate to="/me" replace />;

  return (
    <PageShell title="Sign in" back={{ to: '/', label: 'Home' }}>
      <SingleRegionPage page="login">
        <Card
          as="section"
          className={`stack ${styles.card}`}
          data-gap="4"
          aria-label="Sign in"
        >
          {page.redirected ? (
            <p className="type-title" role="status">
              Sign in to continue. You’ll come back to the page you were opening.
            </p>
          ) : null}
          <p className="type-body reading-column">
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
            <Link className="btn btn--secondary" to="/">
              Browse as guest
            </Link>
          </div>
        </Card>
      </SingleRegionPage>
    </PageShell>
  );
}
