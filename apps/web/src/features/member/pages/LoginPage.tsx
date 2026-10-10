import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { canAccessVerify, isAdmin } from '../../../auth/roles.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  acknowledgeSuppressedNotifications,
  loadNotifications,
  loadUnreadCount,
} from '../adapters/notificationsAdapter.js';

export function LoginPage(): React.JSX.Element {
  const { login, logout, isAuthenticated } = useAuth();
  const me = useMe();
  const roles = me.data?.roles ?? [];
  const client = useQueryClient();
  const unreadQ = useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: loadUnreadCount,
    enabled: isAuthenticated,
  });
  const listQ = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: loadNotifications,
    enabled: isAuthenticated,
  });
  const ack = useMutation({
    mutationFn: acknowledgeSuppressedNotifications,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.notifications });
      await client.invalidateQueries({
        queryKey: queryKeys.notificationsUnread,
      });
    },
  });

  return (
    <PageShell title={isAuthenticated ? 'Account' : 'Sign in'}>
      <SingleRegionPage page="login">
        {!isAuthenticated ? (
          <button type="button" className="btn" onClick={login}>
            Continue with Discord
          </button>
        ) : (
          <div className="stack">
            <p className="type-body">
              Signed in as {me.data?.displayName ?? me.data?.handle ?? 'member'}.
            </p>
            <div className="row">
              <Link className="btn btn-ghost" to="/search">
                Search
              </Link>
              {isAdmin(roles) ? (
                <Link className="btn btn-ghost" to="/admin">
                  Admin
                </Link>
              ) : null}
              {canAccessVerify(roles) ? (
                <Link className="btn btn-ghost" to="/verify">
                  Verification
                </Link>
              ) : null}
            </div>
            <section className="card stack" aria-label="Notifications">
              <h2 className="type-heading">Notifications</h2>
              {unreadQ.isError || listQ.isError ? (
                <StatePanel
                  status="error"
                  error={toAppError(
                    unreadQ.error ?? listQ.error,
                    'notifications:page',
                  )}
                />
              ) : unreadQ.isLoading || listQ.isLoading || !listQ.data ? (
                <StatePanel status="loading" />
              ) : (
                <>
                  <p className="type-caption">
                    Unread: {unreadQ.data ?? 0}
                  </p>
                  {listQ.data.length === 0 ? (
                    <p className="type-caption">No notifications.</p>
                  ) : (
                    <ul className="stack">
                      {listQ.data.map((n) => (
                        <li key={n.id}>
                          <p className="type-title">{n.label}</p>
                          {n.summary ? (
                            <p className="type-caption">{n.summary}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={ack.isPending}
                    onClick={() => ack.mutate()}
                  >
                    Acknowledge suppressed
                  </button>
                </>
              )}
            </section>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
