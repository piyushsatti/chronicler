import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useAuthCallback } from '../hooks/useAuthCallback.js';
import styles from './login.module.css';

export function AuthCallbackPage(): React.JSX.Element {
  const { error } = useAuthCallback();

  return (
    <PageShell
      eyebrow="Sign in"
      title={error ? 'Sign-in didn’t finish' : 'Signing you in'}
    >
      <SingleRegionPage page="auth-callback">
        {error ? (
          <Card as="section" className={`stack ${styles.card}`}
            data-gap="4"
            aria-label="Sign-in problem">
            <StatePanel status="error" error={error} variant="inline" />
            <div className="row" data-wrap="1" data-gap="2">
              <Link className="btn btn--primary" to="/login">
                Try signing in again
              </Link>
              <Link className="btn btn--ghost" to="/">
                Browse as guest
              </Link>
            </div>
          </Card>
        ) : (
          <Card as="section" className={`stack ${styles.card}`}
            data-gap="3"
            aria-busy="true">
            <p className="type-body" role="status">
              Finishing sign-in with Discord…
            </p>
            <Skeleton width="12rem" aria-label="Signing in" />
          </Card>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
