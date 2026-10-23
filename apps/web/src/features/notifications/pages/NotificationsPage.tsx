import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Link } from 'react-router-dom';
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
        <StatePanel
          status="empty"
          title="No notifications yet"
          emptyMessage="Updates about your characters, quests and documents will show up here."
          action={
            <Link className="btn btn--secondary" to="/settings">
              Notification settings
            </Link>
          }
        />
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
      <PageShell>
        <PageHeader
          title="Notifications"
          lede="Reviews, sign-ups and schedule changes that involve you."
        />
        <SingleRegionPage page="notifications">
          <NotificationsBody />
        </SingleRegionPage>
      </PageShell>
    </ProtectedRoute>
  );
}
