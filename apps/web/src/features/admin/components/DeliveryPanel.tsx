import { Button } from '../../../components/primitives/Button.js';
import { isSafeInternalPath, isSafeUrl } from '../../../utils/url.js';
import { AdminPagination } from './AdminPagination.js';
import { deliveryReference, deliveryTitle, deliveryTone } from './deliveryTitle.js';
import { AdminAlertRow } from './AdminAlertRow.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey, isSentinelDate, labelFor } from '../../../utils/format.js';
import type { AdminOperationsView } from '../hooks/useAdminOperations.js';
import styles from './adminOps.module.css';

/** Health shown as a chip only when it was actually observed. */
function HealthChip({
  healthy,
}: {
  healthy: boolean | null;
}): React.JSX.Element | null {
  if (healthy === null) return null;
  return (
    <Chip tone={healthy ? 'line' : 'accent'} size="sm">
      {healthy ? 'Healthy' : 'Needs attention'}
    </Chip>
  );
}

const DELIVERY_STATES: Record<string, string> = {
  queued: 'Queued',
  succeeded: 'Delivered',
  retry_wait: 'Waiting to retry',
  repair_required: 'Needs repair',
  dead: 'Gave up',
  cancelled: 'Cancelled',
};

export function DeliveryPanel({
  view,
}: {
  view: AdminOperationsView;
}): React.JSX.Element {
  const { query, alertPage } = view;
  const { formatDateTime } = useDateFormatter();
  if (query.isError) {
    return (
      <div className="stack">
        <StatePanel status="error" error={query.error} />
        <Button onClick={view.retry}>Retry diagnostics</Button>
      </div>
    );
  }
  if (query.isLoading || !query.data) {
    return <StatePanel status="loading" />;
  }

  const ops = query.data;
  return (
    <div className="stack" data-el="admin.deliveryPanel">
      <div className={styles.summary}>
        <StatTile
          label="Active alerts"
          value={ops.activeAlertCount}
          tone={ops.activeAlertCount ? 'warn' : 'good'}
        />
        <StatTile
          label="Pending deliveries"
          value={ops.pendingDeliveryCount}
          hint={`of ${ops.deliveryTotal}`}
        />
      </div>
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Setup</h2>
        <ul className={styles.list} aria-label="Delivery setup">
          <li className={styles.item}>
            <span className="type-body">Delivery mode</span>
            <Chip tone="line" size="sm">
              {humanizeKey(ops.config.deliveryMode)}
            </Chip>
          </li>
          <li className={styles.item}>
            <span className="type-body">
              Site address: {ops.config.publicOrigin || 'not set'}
            </span>
            {ops.config.publicOrigin || ops.config.publicOriginHealthy !== null ? (
              <HealthChip healthy={ops.config.publicOriginHealthy} />
            ) : (
              <Chip tone="accent" size="sm">
                Needs setup
              </Chip>
            )}
          </li>
          <li className={styles.item}>
            <span className="type-body">
              Discord announcements role:{' '}
              {ops.config.announcementRoleId ? 'set' : 'not set'}
            </span>
            {ops.config.announcementRoleId ||
            ops.config.announcementRoleHealthy !== null ? (
              <HealthChip healthy={ops.config.announcementRoleHealthy} />
            ) : (
              <Chip tone="accent" size="sm">
                Needs setup
              </Chip>
            )}
          </li>
        </ul>
      </Card>
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Scheduled jobs</h2>
        {ops.scheduledWork.length === 0 ? (
          <EmptyState kind="no-events" message="No scheduled jobs have reported yet." />
        ) : (
          <ul className={styles.list}>
            {ops.scheduledWork.map((work) => (
              <li key={work.kind} className={styles.item}>
                <div className="stack" data-gap="1">
                  <span className="type-title">{humanizeKey(work.kind)}</span>
                  <span className="type-caption">
                    {work.lastStartedAt
                      ? `Last ran ${formatDateTime(work.lastStartedAt)}`
                      : 'Has not run yet'}
                  </span>
                </div>
                <Chip tone="line" size="sm">
                  {work.outcome ? humanizeKey(work.outcome) : 'No result yet'}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <section className="stack" aria-label="Deliveries" data-gap="3">
        <h2 className="type-title">Deliveries</h2>
        <AdminPagination page={view.deliveryPage} />
        {ops.deliveries.length === 0 ? (
          <EmptyState kind="no-events" message="No deliveries on this page." />
        ) : (
          <Card className={`stack ${styles.panel}`}>
            <ul className={styles.list} aria-label="Deliveries">
              {ops.deliveries.map((delivery, index) => {
                const retryAt =
                  delivery.nextAttemptAt &&
                  !['succeeded', 'cancelled', 'dead'].includes(delivery.state)
                    ? delivery.nextAttemptAt
                    : null;
                const title = deliveryTitle(
                  delivery,
                  view.deliveryPage.offset + index + 1,
                );
                return (
                  <li key={delivery.id} className={styles.item}>
                    <div className="stack" data-gap="1">
                      <span className="type-title">{title}</span>
                      <span className="type-caption">
                        {deliveryReference(delivery, formatDateTime)}.{' '}
                        {delivery.failureStreak > 0
                          ? `Tried ${delivery.failureStreak} of ${delivery.maxAttempts} times. `
                          : ''}
                        {retryAt
                          ? isSentinelDate(retryAt)
                            ? 'Waiting for a retry. '
                            : `Next try ${formatDateTime(retryAt)}. `
                          : ''}
                        Updated {formatDateTime(delivery.updatedAt)}.
                      </span>
                      {delivery.safeError ? (
                        <span role="status" className="type-caption">
                          {delivery.safeError}
                        </span>
                      ) : null}
                    </div>
                    <div className="row" data-gap="2" data-align="center" data-wrap="1">
                      <Chip
                        tone={deliveryTone(delivery.state)}
                        size="sm"
                      >
                        {labelFor(delivery.state, DELIVERY_STATES)}
                      </Chip>
                      {delivery.questLink && isSafeInternalPath(delivery.questLink) ? (
                        <Link
                          className="btn btn--secondary btn--sm"
                          to={delivery.questLink}
                        >
                          Open quest
                        </Link>
                      ) : null}
                      {delivery.eventLink && isSafeUrl(delivery.eventLink) ? (
                        <a
                          className="btn btn--secondary btn--sm"
                          href={delivery.eventLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Discord event
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Active alerts</h2>
        <AdminPagination page={alertPage} />
        {ops.activeAlerts.length === 0 ? (
          <EmptyState kind="no-events" message="No active alerts." />
        ) : (
          <ul className={styles.list} aria-label="Active alerts">
            {ops.activeAlerts.map((alert) => (
              <AdminAlertRow key={alert.key} alert={alert} className={styles.item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
