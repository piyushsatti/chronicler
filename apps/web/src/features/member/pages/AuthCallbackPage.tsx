import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useAuthCallback } from '../hooks/useAuthCallback.js';

export function AuthCallbackPage(): React.JSX.Element {
  const { error } = useAuthCallback();

  return (
    <PageShell title="Sign in">
      <SingleRegionPage page="auth-callback">
        {error ? (
          <StatePanel status="error" error={error} />
        ) : (
          <StatePanel status="loading" />
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
