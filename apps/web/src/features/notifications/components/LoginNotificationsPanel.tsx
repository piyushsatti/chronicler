import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { pluralize } from '../../../utils/format.js';
import { NotificationRow } from './NotificationRow.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useLoginNotifications } from '../hooks/useLoginNotifications.js';
import styles from './loginNotifications.module.css';

export function LoginNotificationsPanel({
  enabled,
}: {
  enabled: boolean;
}): React.JSX.Element {
  const { unreadQ, listQ, ack, accountError, retry, ready } =
    useLoginNotifications(enabled);

  return (
    <section className={`card stack ${styles.panel}`} aria-label="Notifications">
      <h2 className="type-heading">Notifications</h2>
      {accountError || unreadQ.isError || listQ.isError ? (
        <div className="stack">
          <StatePanel
            status="error"
            error={toAppError(
              accountError ?? unreadQ.error ?? listQ.error,
              'notifications:page',
            )}
          />
          <Button type="button" variant="secondary" onClick={retry}>
            Retry notifications
          </Button>
        </div>
      ) : !ready || unreadQ.isLoading || listQ.isLoading || !listQ.data ? (
        <StatePanel status="loading" />
      ) : (
        <>
          {(unreadQ.data ?? 0) > 0 ? (
            <p className="type-body">
              You have {pluralize(unreadQ.data ?? 0, 'unread notification')}.
            </p>
          ) : listQ.data.items.length > 0 ? (
            <p className="type-body">You’re all caught up.</p>
          ) : null}
          {listQ.data.items.length === 0 ? (
            <p className="type-body">No notifications yet.</p>
          ) : null}
          {listQ.data.items.length === 0 ? null : (
            <ul className="stack">
              {listQ.data.items.map((n) => (
                <li key={n.id}>
                  <NotificationRow notification={n} />
                </li>
              ))}
            </ul>
          )}
          <div className="row" data-wrap="1" data-gap="2">
            <Link className="btn btn--secondary" to="/notifications">
              Open inbox
            </Link>
            <Button
              type="button"
              variant="ghost"
              disabled={ack.isPending}
              onClick={() => ack.mutate()}
            >
              {ack.error
                ? 'Retry clearing'
                : ack.isPending
                  ? 'Clearing…'
                  : 'Clear alerts for removed pages'}
            </Button>
          </div>
          <p className="type-caption">
            Some alerts point to pages that were removed or that you can no longer open.
            Clearing marks them as read.
          </p>
          {ack.error ? (
            <StatePanel status="error" error={ack.error} variant="inline" />
          ) : null}
          {ack.feedback ? (
            <p className="type-caption" role="status">
              {ack.feedback}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
