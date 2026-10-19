import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { DeliveryPanelView } from '../hooks/useDeliveryPanel.js';

export function DeliveryPanel({
  view,
}: {
  view: DeliveryPanelView;
}): React.JSX.Element {
  if (view.status === 'error') {
    return <StatePanel status="error" error={view.error} />;
  }
  if (view.status === 'loading') {
    return <StatePanel status="loading" />;
  }

  const { ops } = view;
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
        <h3 className="type-heading">Active alerts</h3>
        {ops.activeAlerts.length === 0 ? (
          <EmptyState kind="no-events" message="No delivery alerts. Queue is healthy." />
        ) : (
          <ul className="stack">
            {ops.activeAlerts.map((alert) => (
              <li key={alert.key} className="card stack">
                <div className="row" data-justify="between">
                  <strong className="type-title">{alert.label}</strong>
                  <Chip tone="status" size="sm">
                    {alert.severity}
                  </Chip>
                </div>
                <p className="type-caption">
                  First seen {alert.firstSeenAt ?? '—'} · Last seen{' '}
                  {alert.lastSeenAt ?? '—'}
                </p>
                <Link className="btn btn--ghost btn--sm" to={alert.remediationHref}>
                  Open remediation surface
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
