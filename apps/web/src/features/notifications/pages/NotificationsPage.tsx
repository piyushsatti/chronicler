import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { NotificationRow } from '../components/NotificationRow.js';
import { NotificationsLoadMoreSentinel } from '../components/NotificationsLoadMoreSentinel.js';
import { useNotificationsPage } from '../hooks/useNotificationsPage.js';

function NotificationsBody(): React.JSX.Element {
  const page = useNotificationsPage();

  if (page.status === 'error') {
    return <StatePanel status="error" error={page.error} />;
  }
  if (page.status === 'loading') {
    return <StatePanel status="loading" />;
  }

  const {
    items,
    markReadFailureIds,
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
      {items.length === 0 ? (
        <EmptyState kind="generic" message="No notifications yet." />
      ) : (
        <ul className="notification-list stack">
          {items.map((item) => (
            <li key={item.id} className="notification-list__item">
              <NotificationRow notification={item} />
            </li>
          ))}
        </ul>
      )}
      <NotificationsLoadMoreSentinel
        enabled={hasNextPage && !isFetchingNextPage}
        onLoadMore={fetchNextPage}
      />
      {isFetchingNextPage ? (
        <p className="type-caption" role="status">
          Loading more…
        </p>
      ) : null}
      {hasNextPage && !isFetchingNextPage ? (
        <Button type="button" variant="secondary" onClick={fetchNextPage}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

export function NotificationsPage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <SingleRegionPage page="notifications">
        <p className="eyebrow">Inbox</p>
        <h1 className="type-display" data-el="notifications.title">
          Notifications
        </h1>
        <NotificationsBody />
      </SingleRegionPage>
    </ProtectedRoute>
  );
}
