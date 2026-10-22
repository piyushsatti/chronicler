import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import styles from '../components/loginNotifications.module.css';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { NotificationRow } from '../components/NotificationRow.js';
import { NotificationsLoadMoreSentinel } from '../components/NotificationsLoadMoreSentinel.js';
import { useNotificationsPage } from '../hooks/useNotificationsPage.js';
import { pluralize } from '../../../utils/format.js';

function NotificationsBody(): React.JSX.Element {
  const page = useNotificationsPage();

  if (page.status === 'error') {
    return (
      <div className="stack">
        <StatePanel status="error" error={page.error} />
        <Button type="button" variant="secondary" onClick={page.retry}>
          Retry notifications
        </Button>
      </div>
    );
  }
  if (page.status === 'loading') {
    return <StatePanel status="loading" />;
  }

  const {
    items,
    markReadFailureIds,
    markReadSuccessCount,
    loadMoreError,
    retryMarkRead,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = page;

  return (
    <div className="stack" data-el="notifications.list">
      {markReadFailureIds.length > 0 ? (
        <p className="type-caption" role="alert">
          Some notifications could not be marked as read.
        </p>
      ) : null}
      {markReadFailureIds.length > 0 ? (
        <Button type="button" variant="secondary" onClick={retryMarkRead}>
          Retry mark read
        </Button>
      ) : null}
      {markReadSuccessCount > 0 ? (
        <p className="type-caption" role="status">
          Marked {pluralize(markReadSuccessCount, 'notification')} as read.
        </p>
      ) : null}
      {loadMoreError ? <StatePanel status="error" error={loadMoreError} /> : null}
      {items.length === 0 && hasNextPage ? (
        <StatePanel
          status="empty"
          variant="inline"
          emptyMessage="No visible notifications on this page. More may be available."
        />
      ) : items.length === 0 ? (
        <Card
          as="section"
          className={`stack ${styles.panel}`}
          data-gap="3"
          aria-labelledby="inbox-empty"
        >
          <h2 className="type-title" id="inbox-empty">
            No notifications yet
          </h2>
          <p className="type-body">
            Character verifications, quest signups and scheduling, and activity on your
            documents will show up here. Choose which ones you get in your settings.
          </p>
          <div className="row" data-wrap="1" data-gap="2">
            <Link className="btn btn--secondary" to="/quests">
              Find a quest
            </Link>
            <Link className="btn btn--ghost" to="/settings">
              Notification settings
            </Link>
          </div>
        </Card>
      ) : (
        <ul className="notification-list stack">
          {items.map((item) => (
            <li key={item.id} className="notification-list__item">
              <NotificationRow notification={item} />
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 ? (
        <div className="row" data-wrap="1">
          <Link className="btn btn--ghost btn--sm" to="/settings">
            Notification settings
          </Link>
        </div>
      ) : null}
      <NotificationsLoadMoreSentinel
        enabled={hasNextPage && !isFetchingNextPage && loadMoreError === null}
        onLoadMore={fetchNextPage}
      />
      {isFetchingNextPage ? (
        <StatePanel status="loading" variant="inline" />
      ) : null}
      {hasNextPage && !isFetchingNextPage ? (
        <Button type="button" variant="secondary" onClick={fetchNextPage}>
          {loadMoreError ? 'Retry load more' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

export function NotificationsPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <PageShell eyebrow="Inbox" title="Notifications">
        <SingleRegionPage page="notifications">
          <NotificationsBody />
        </SingleRegionPage>
      </PageShell>
    </ProtectedRoute>
  );
}
