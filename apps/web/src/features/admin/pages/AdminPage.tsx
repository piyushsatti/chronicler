import { AdminReadFailure } from '../components/AdminReadFailure.js';
import { Link } from 'react-router-dom';
import { deliveryReference, deliveryTitle, deliveryTone } from '../components/deliveryTitle.js';
import { AdminAlertRow } from '../components/AdminAlertRow.js';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { isSafeInternalPath } from '../../../utils/url.js';
import { labelFor, pluralize } from '../../../utils/format.js';
import type { AdminOpsView } from '../types.js';
import { useAdminTodayPage } from '../hooks/useAdminSectionPage.js';
import styles from './adminToday.module.css';

/** How many alerts and deliveries the overview previews before linking on. */
const PREVIEW = 3;

const DELIVERY_STATES: Record<string, string> = {
  queued: 'Queued',
  succeeded: 'Delivered',
  retry_wait: 'Waiting to retry',
  repair_required: 'Needs repair',
  dead: 'Gave up',
  cancelled: 'Cancelled',
};

function TodaySummary({
  ops,
  characterTotal,
  reviewTotal,
}: {
  ops: AdminOpsView;
  characterTotal: number | null;
  reviewTotal: number | null;
}): React.JSX.Element {
  return (
    <section aria-label="Summary" data-el="admin.today.summary">
      <div className={styles.summary}>
        <Link
          className={styles.stat}
          to="/admin/data-health"
          data-el="admin.today.alerts"
        >
          <StatTile
            label="Active alerts"
            value={ops.activeAlertCount}
            tone={ops.activeAlertCount ? 'warn' : 'good'}
            hint="See Data health"
          />
        </Link>
        <Link className={styles.stat} to="/admin/delivery">
          <StatTile
            label="Pending deliveries"
            value={ops.pendingDeliveryCount}
            tone={ops.pendingDeliveryCount ? 'accent' : 'neutral'}
            hint={`of ${pluralize(ops.deliveryTotal, 'delivery', 'deliveries')}`}
          />
        </Link>
        <Link className={styles.stat} to="/admin/review">
          <StatTile
            label="Awaiting review"
            value={reviewTotal ?? '–'}
            tone={reviewTotal ? 'accent' : 'neutral'}
            hint="Waiting for a decision"
          />
        </Link>
        <Link className={styles.stat} to="/admin/characters">
          <StatTile
            label="Characters"
            value={characterTotal ?? '–'}
            hint="In the directory"
          />
        </Link>
      </div>
    </section>
  );
}

function AttentionCard({ ops }: { ops: AdminOpsView }): React.JSX.Element {
  const shown = ops.activeAlerts.slice(0, PREVIEW);
  return (
    <Card className={`stack ${styles.panel}`} data-el="admin.today.attention">
      <div className="row" data-justify="between" data-align="center">
        <h2 className="type-title">Needs attention</h2>
        <Link
          className="btn btn--secondary btn--sm"
          to="/admin/data-health"
          aria-label="View all alerts"
        >
          View all
        </Link>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          kind="no-events"
          message="No active alerts. Everything is running."
        />
      ) : (
        <ul className={styles.list} aria-label="Active alerts">
          {shown.map((alert) => (
            <AdminAlertRow key={alert.key} alert={alert} className={styles.item} />
          ))}
        </ul>
      )}
      {ops.activeAlertCount > shown.length ? (
        <p className="type-caption">
          {pluralize(ops.activeAlertCount - shown.length, 'more alert')} in Data health.
        </p>
      ) : null}
    </Card>
  );
}

function RecentDeliveriesCard({ ops }: { ops: AdminOpsView }): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const shown = ops.deliveries.slice(0, PREVIEW);
  return (
    <Card className={`stack ${styles.panel}`} data-el="admin.today.deliveries">
      <div className="row" data-justify="between" data-align="center">
        <h2 className="type-title">Recent Discord deliveries</h2>
        <Link
          className="btn btn--secondary btn--sm"
          to="/admin/delivery"
          aria-label="View all deliveries"
        >
          View all
        </Link>
      </div>
      {shown.length === 0 ? (
        <EmptyState kind="no-events" message="No deliveries recorded yet." />
      ) : (
        <ul className={styles.list} aria-label="Recent deliveries">
          {shown.map((delivery, index) => (
            <li key={delivery.id} className={styles.item}>
              <div className="stack" data-gap="1">
                <span className="type-title">
                  {deliveryTitle(delivery, index + 1)}
                </span>
                <span className="type-caption">
                  {deliveryReference(delivery, formatDateTime)}. Updated{' '}
                  {formatDateTime(delivery.updatedAt)}
                </span>
              </div>
              <div className="row" data-gap="2" data-align="center" data-wrap="1">
                <Chip
                  tone={deliveryTone(delivery.state)}
                  size="sm"
                >
                  {labelFor(delivery.state, DELIVERY_STATES)}
                </Chip>
                {delivery.questLink && isSafeInternalPath(delivery.questLink) ? (
                  <Link className="btn btn--secondary btn--sm" to={delivery.questLink}>
                    Open quest
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Body used by route shell and direct unit tests. */
export function AdminTodayBody(): React.JSX.Element {
  const view = useAdminTodayPage();
  if (view.status === 'error')
    return <AdminReadFailure error={view.error} retry={view.retry} />;
  if (view.status === 'loading') return <StatePanel status="loading" />;
  const { ops, characterTotal, reviewTotal } = view.data;
  return (
    <div className="stack" data-gap="5">
      <TodaySummary
        ops={ops}
        characterTotal={characterTotal}
        reviewTotal={reviewTotal}
      />
      <div className={styles.panels}>
        <AttentionCard ops={ops} />
        <RecentDeliveriesCard ops={ops} />
      </div>
    </div>
  );
}

export function AdminPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-today"
      title="Today"
      lede="What needs attention across the server right now."
    >
      <AdminTodayBody />
    </AdminWorkspaceShell>
  );
}
