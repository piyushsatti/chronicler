import { Card } from '../../../components/primitives/Card.js';
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

  return (
    <Card className="stack" data-el="admin.deliveryPanel" aria-label="Discord delivery">
      <h3 className="type-heading">Discord delivery</h3>
      <p className="type-body">Active alerts: {view.ops.activeAlertCount}</p>
      <p className="type-body">Pending deliveries: {view.ops.pendingDeliveryCount}</p>
      <p className="type-caption">Delivery total: {view.ops.deliveryTotal}</p>
    </Card>
  );
}
