import { Button } from '../../../components/primitives/Button.js';
import { useState } from 'react';
import { isSafeInternalPath, isSafeUrl } from '../../../utils/url.js';
import { AdminPagination } from './AdminPagination.js';
import { deliveryReference, deliveryTitle, deliveryTone } from './deliveryTitle.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey, isSentinelDate, labelFor, pluralize } from '../../../utils/format.js';
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
    <Chip tone={healthy ? 'line' : 'warning'} size="sm">
      {healthy ? 'Healthy' : 'Needs attention'}
    </Chip>
  );
}

/** States that no longer retry on their own; an admin may redrive them. */
const REDRIVABLE_STATES = new Set(['dead', 'repair_required']);

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
  const { query } = view;
  const [state, setState] = useState('');
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
  const states = [...new Set([
    ...ops.deliveries.map((delivery) => delivery.state),
    ...(state ? [state] : []),
  ])];
  const deliveries = ops.deliveries.filter((delivery) => !state || delivery.state === state);
  return (
    <div className="stack" data-el="admin.deliveryPanel">
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Setup</h2>
        <ul className={styles.list} aria-label="Delivery setup">
          <li className={styles.item}>
            <span className="type-body">Delivery mode</span>
            <span className="type-ui">
              {labelFor(ops.config.deliveryMode, {
                inbox: 'Background delivery',
                queue: 'Background delivery',
                disabled: 'Paused',
                direct: 'Immediate delivery',
              })}
            </span>
          </li>
          <li className={styles.item}>
            <div className="stack" data-gap="1">
              <span className="type-body">Site address</span>
              <span className="type-caption">{ops.config.publicOrigin || 'Not set'}</span>
            </div>
            {ops.config.publicOrigin || ops.config.publicOriginHealthy !== null ? (
              <HealthChip healthy={ops.config.publicOriginHealthy} />
            ) : (
              <Chip tone="warning" size="sm">
                Needs setup
              </Chip>
            )}
          </li>
          <li className={styles.item}>
            <div className="stack" data-gap="1">
              <span className="type-body">Discord announcements role</span>
              <span className="type-caption">{ops.config.announcementRoleId ? 'Set' : 'Not set'}</span>
            </div>
            {ops.config.announcementRoleId ||
            ops.config.announcementRoleHealthy !== null ? (
              <HealthChip healthy={ops.config.announcementRoleHealthy} />
            ) : (
              <Chip tone="warning" size="sm">
                Needs setup
              </Chip>
            )}
          </li>
        </ul>
      </Card>
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Scheduled jobs</h2>
        {ops.scheduledWork.length === 0 ? (
          <EmptyState
            kind="no-events"
            message="No scheduled jobs have reported yet."
            actionLabel="Refresh delivery status"
            onAction={view.retry}
          />
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
      <Card as="section" className={`stack ${styles.panel}`} aria-label="Deliveries">
        <h2 className="type-title">Deliveries</h2>
        <FilterBar
          label="Filter deliveries"
          count={pluralize(deliveries.length, 'delivery', 'deliveries')}
        >
          <FilterBar.Picker
            label="Status on this page"
            value={state}
            onValueChange={setState}
            options={[
              { value: '', label: 'All' },
              ...states.map((value) => ({ value, label: labelFor(value, DELIVERY_STATES) })),
            ]}
          />
          <span className="type-caption">
            {ops.deliveryTotal} recorded · {pluralize(ops.pendingDeliveryCount, 'delivery', 'deliveries')} waiting
          </span>
          <Link className="type-caption" to="/admin/data-health">
            {pluralize(ops.activeAlertCount, 'active alert')}
          </Link>
        </FilterBar>
        {view.redriveFeedback ? (
          <p
            className="type-caption"
            role={view.redriveFeedback.isError ? 'alert' : 'status'}
          >
            {view.redriveFeedback.message}
          </p>
        ) : null}
        <AdminPagination page={view.deliveryPage} />
        {deliveries.length === 0 ? (
          <EmptyState
            kind="no-events"
            message="No deliveries on this page."
            action={state
              ? <Button variant="secondary" onClick={() => setState('')}>Clear filters</Button>
              : <Link to="/quests" className="btn btn--secondary">Browse quests</Link>}
          />
        ) : (
            <ul className={styles.list} aria-label="Deliveries">
              {deliveries.map((delivery) => {
                const retryAt =
                  delivery.nextAttemptAt &&
                  !['succeeded', 'cancelled', 'dead', 'repair_required'].includes(
                    delivery.state,
                  )
                    ? delivery.nextAttemptAt
                    : null;
                const title = deliveryTitle(
                  delivery,
                  view.deliveryPage.offset + ops.deliveries.indexOf(delivery) + 1,
                );
                return (
                  <li key={delivery.id} className={styles.item}>
                    <div className="stack" data-gap="1">
                      <span className="type-title">{title}</span>
                      <span className="type-caption">
                        Discord quest announcement{!delivery.questTitle?.trim() ? ' · Quest title unavailable' : ''}
                      </span>
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
                      {REDRIVABLE_STATES.has(delivery.state) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={view.redrive.isPending}
                          onClick={() => view.redrive.mutate(delivery.id)}
                        >
                          {view.redrive.isPending &&
                          view.redrive.variables === delivery.id
                            ? 'Retrying…'
                            : 'Retry delivery'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
        )}
      </Card>

    </div>
  );
}
