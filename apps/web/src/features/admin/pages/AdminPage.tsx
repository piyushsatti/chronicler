import { Link } from 'react-router-dom';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { CharacterDirectoryPanel } from '../components/CharacterDirectoryPanel.js';
import { DeliveryPanel } from '../components/DeliveryPanel.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { AdminOpsView } from '../types.js';
import { useAdminTodayPage } from '../hooks/useAdminSectionPage.js';
import styles from './adminToday.module.css';

function TodaySummary({ ops }: { ops: AdminOpsView }): React.JSX.Element {
  return (
    <div className="stack" data-el="admin.today.summary">
      <p className="eyebrow">Operations</p>
      <div className={styles.summary}>
        <Link
          className={styles.stat}
          to="/admin/data-health"
          data-el="admin.today.alerts"
        >
          <p className="type-value">{ops.activeAlertCount}</p>
          <p className="type-caption">Active alerts</p>
        </Link>
        <Link className={styles.stat} to="/admin/delivery">
          <p className="type-value">{ops.pendingDeliveryCount}</p>
          <p className="type-caption">Pending deliveries</p>
        </Link>
        <Link className={styles.stat} to="/admin/delivery">
          <p className="type-value">{ops.deliveryTotal}</p>
          <p className="type-caption">Delivery total</p>
        </Link>
        <Link className={styles.stat} to="/admin/review">
          <p className="type-value">Review</p>
          <p className="type-caption">Verification queue</p>
        </Link>
      </div>
      {ops.activeAlerts.length === 0 ? (
        <EmptyState kind="no-events" message="No active alerts." />
      ) : (
        <ul className={styles.alerts} aria-label="Active alerts">
          {ops.activeAlerts.map((alert) => (
            <li key={alert.key} className="row" data-justify="between">
              <span className="type-title">{alert.label}</span>
              <Link className="type-link" to={alert.remediationHref}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Body used by route shell and direct unit tests. */
export function AdminTodayBody(): React.JSX.Element {
  const view = useAdminTodayPage();
  if (view.status === 'error') return <StatePanel status="error" error={view.error} />;
  if (view.status === 'loading') return <StatePanel status="loading" />;
  const { delivery, characters } = view.data;
  if (delivery.status !== 'ready') return <StatePanel status="loading" />;
  return (
    <div className="stack">
      <TodaySummary ops={delivery.ops} />
      <DeliveryPanel view={delivery} />
      <CharacterDirectoryPanel view={characters} />
    </div>
  );
}

export function AdminPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-today" title="Today">
      <AdminTodayBody />
    </AdminWorkspaceShell>
  );
}
