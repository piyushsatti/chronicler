import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AUTH_CALLBACK_PATH } from '../../../api/endpoints.js';
import { restRequest } from '../../../api/rest.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';

export function AuthCallbackPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { storeToken } = useAuth();
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      setError(toAppError({ failure: 'InvalidWire' }, 'auth:callback'));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const body = await restRequest<{ token: string }>(AUTH_CALLBACK_PATH, {
          method: 'POST',
          body: JSON.stringify({
            code,
            state: params.get('state') ?? undefined,
          }),
        });
        if (cancelled) return;
        storeToken(body.token);
        navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) setError(toAppError(err, 'auth:callback'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, params, storeToken]);

  if (error) {
    return (
      <PageShell title="Sign in">
        <SingleRegionPage page="auth-callback">
          <StatePanel status="error" error={error} />
        </SingleRegionPage>
      </PageShell>
    );
  }
  return (
    <PageShell title="Sign in">
      <SingleRegionPage page="auth-callback">
        <StatePanel status="loading" />
      </SingleRegionPage>
    </PageShell>
  );
}
