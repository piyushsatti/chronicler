import { Button } from '../../../components/primitives/Button.js';
import { isSafeInternalPath } from '../../../utils/url.js';
import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey } from '../../../utils/format.js';
import type { AdminOperationsView } from '../hooks/useAdminOperations.js';

export function DataHealthPanel({
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
    <div className="stack" data-el="admin.dataHealthPanel">
      <Card className="stack">
        <div className="row" data-justify="between">
          <h3 className="type-heading">Live integrity signals</h3>
          <Chip tone={ops.activeAlertCount ? 'status' : 'line'} size="sm">
            {ops.activeAlertCount} active
          </Chip>
        </div>
        <p className="type-caption">
          Background job failures and bot heartbeat alerts.
        </p>
        <p className="type-caption">
          Pending deliveries: {ops.pendingDeliveryCount} · Total tracked:{' '}
          {ops.deliveryTotal}
        </p>
      </Card>
      <Card className="stack">
        <h3 className="type-heading">Active exceptions</h3>
        <AdminPagination page={alertPage} />
        {ops.activeAlerts.length === 0 ? (
          <EmptyState kind="no-events" message="No active exceptions on this page." />
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
