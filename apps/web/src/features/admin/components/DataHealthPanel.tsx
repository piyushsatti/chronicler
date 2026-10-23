import { Button } from '../../../components/primitives/Button.js';
import { AdminPagination } from './AdminPagination.js';
import { AdminAlertRow } from './AdminAlertRow.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { AdminOperationsView } from '../hooks/useAdminOperations.js';
import styles from './adminOps.module.css';

export function DataHealthPanel({
  view,
}: {
  view: AdminOperationsView;
}): React.JSX.Element {
  const { query, alertPage } = view;
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
    <div className="stack" data-el="admin.dataHealthPanel">
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
        <AdminPagination page={alertPage} />
        {ops.activeAlerts.length === 0 ? (
          <EmptyState
            kind="no-events"
            message="All clear. No problems are being reported."
          />
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
