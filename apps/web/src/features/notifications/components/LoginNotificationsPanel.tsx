import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useLoginNotifications } from '../hooks/useLoginNotifications.js';

export function LoginNotificationsPanel({
  enabled,
}: {
  enabled: boolean;
}): React.JSX.Element {
  const { unreadQ, listQ, ack } = useLoginNotifications(enabled);

  return (
    <section className="card stack" aria-label="Notifications">
      <h2 className="type-heading">Notifications</h2>
      {unreadQ.isError || listQ.isError ? (
        <StatePanel
          status="error"
          error={toAppError(unreadQ.error ?? listQ.error, 'notifications:page')}
        />
      ) : unreadQ.isLoading || listQ.isLoading || !listQ.data ? (
        <StatePanel status="loading" />
      ) : (
        <>
          <p className="type-caption">Unread: {unreadQ.data ?? 0}</p>
          {listQ.data.items.length === 0 ? (
            <p className="type-caption">No notifications.</p>
          ) : (
            <ul className="stack">
              {listQ.data.items.map((n) => (
                <li key={n.id}>
                  <p className="type-title">{n.label}</p>
                  {n.summary ? <p className="type-caption">{n.summary}</p> : null}
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
  );
}
