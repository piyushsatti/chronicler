import { Button } from '../../../components/primitives/Button.js';
import { isSafeInternalPath, isSafeUrl } from '../../../utils/url.js';
import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey, labelFor } from '../../../utils/format.js';
import type { AdminOperationsView } from '../hooks/useAdminOperations.js';

function healthLabel(observed: boolean | null): string {
  return observed === null ? 'not observed' : observed ? 'healthy' : 'needs attention';
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
    <div className="stack" data-el="admin.deliveryPanel" aria-label="Discord delivery">
      <Card className="stack">
        <div className="row" data-justify="between">
          <h3 className="type-heading">Discord delivery</h3>
          <Chip tone={ops.activeAlertCount ? 'status' : 'line'} size="sm">
            {ops.activeAlertCount} active
          </Chip>
        </div>
        <p className="type-body">Active alerts: {ops.activeAlertCount}</p>
        <p className="type-body">Pending deliveries: {ops.pendingDeliveryCount}</p>
        <p className="type-caption">Delivery total: {ops.deliveryTotal}</p>
      </Card>
      <Card className="stack">
        <h3 className="type-heading">Delivery configuration</h3>
        <p className="type-body">
          Mode: {humanizeKey(ops.config.deliveryMode)} · Public origin:{' '}
          {ops.config.publicOrigin || 'not configured'} (
          {healthLabel(ops.config.publicOriginHealthy)})
        </p>
        <p className="type-caption">
          Announcement role: {ops.config.announcementRoleId ?? 'not configured'} ·{' '}
          {humanizeKey(ops.config.announcementRoleSource)} ·{' '}
          {healthLabel(ops.config.announcementRoleHealthy)}
        </p>
        <h4 className="type-title">Scheduled work</h4>
        {ops.scheduledWork.length === 0 ? (
          <p className="type-caption">No scheduled-work observations.</p>
        ) : (
          <ul className="stack">
            {ops.scheduledWork.map((work) => (
              <li key={work.kind}>
                <strong>{humanizeKey(work.kind)}</strong> ·{' '}
                {work.outcome ? humanizeKey(work.outcome) : 'No outcome recorded'}
                <p className="type-caption">
                  Expected {work.expectedSlot ?? 'unknown'} · Started{' '}
                  {work.lastStartedAt ? formatDateTime(work.lastStartedAt) : 'never'} ·
                  Finished{' '}
                  {work.lastFinishedAt
                    ? formatDateTime(work.lastFinishedAt)
                    : 'not recorded'}
                  {work.safeErrorCode ? ` · ${work.safeErrorCode}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="stack">
        <h3 className="type-heading">Delivery records</h3>
        <AdminPagination page={view.deliveryPage} />
        {ops.deliveries.length === 0 ? (
          <EmptyState kind="no-events" message="No deliveries on this page." />
        ) : (
          <ul className="stack">
            {ops.deliveries.map((delivery) => (
              <li key={delivery.id} className="card stack">
                <strong>
                  {delivery.questTitle ?? delivery.questShortCode ?? 'Quest delivery'}
                </strong>
                <p className="type-body">
                  {labelFor(delivery.state, DELIVERY_STATES)}
                  {delivery.desiredRevision != null || delivery.appliedRevision != null
                    ? ` · Revision ${delivery.appliedRevision ?? '—'} of ${delivery.desiredRevision ?? '—'} applied`
                    : ''}
                </p>
                <p className="type-caption">
                  Failures {delivery.failureStreak} / {delivery.maxAttempts} · Next
                  attempt{' '}
                  {delivery.nextAttemptAt
                    ? formatDateTime(delivery.nextAttemptAt)
                    : 'not scheduled'}{' '}
                  · Updated {formatDateTime(delivery.updatedAt)}
                </p>
                {delivery.safeError ? (
                  <p role="status" className="type-caption">
                    {delivery.safeError}
                  </p>
                ) : null}
                {delivery.questLink && isSafeInternalPath(delivery.questLink) ? (
                  <Link className="type-link" to={delivery.questLink}>
                    Open quest
                  </Link>
                ) : null}
                {delivery.eventLink && isSafeUrl(delivery.eventLink) ? (
                  <a
                    className="type-link"
                    href={delivery.eventLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Discord event
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="stack">
        <h3 className="type-heading">Active alerts</h3>
        <AdminPagination page={alertPage} />
        {ops.activeAlerts.length === 0 ? (
          <EmptyState kind="no-events" message="No active alerts on this page." />
        ) : (
          <ul className="stack">
            {ops.activeAlerts.map((alert) => (
              <li key={alert.key} className="card stack">
                <div className="row" data-justify="between">
                  <strong className="type-title">{alert.label}</strong>
                  <Chip tone="status" size="sm">
                    {humanizeKey(alert.severity)}
                  </Chip>
                </div>
                <p className="type-caption">
                  First seen {formatDateTime(alert.firstSeenAt)} · Last seen{' '}
                  {formatDateTime(alert.lastSeenAt)}
                </p>
                {isSafeInternalPath(alert.remediationHref) ? (
                  <div className="row">
                    <Link className="btn btn--ghost btn--sm" to={alert.remediationHref}>
                      View diagnostics
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
