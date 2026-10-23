import { useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { AdminPagination } from './AdminPagination.js';
import { AdminAlertRow } from './AdminAlertRow.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import type { AdminOperationsView } from '../hooks/useAdminOperations.js';
import styles from './adminOps.module.css';

export function DataHealthPanel({
  view,
}: {
  view: AdminOperationsView;
}): React.JSX.Element {
  const [severity, setSeverity] = useState('');
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
  const severities = [...new Set([
    ...ops.activeAlerts.map((alert) => alert.severity),
    ...(severity ? [severity] : []),
  ])];
  const alerts = ops.activeAlerts.filter((alert) => !severity || alert.severity === severity);
  const healthyChecks = [
    ops.config.publicOriginHealthy,
    ops.config.announcementRoleHealthy,
  ].filter((healthy) => healthy === true).length;
  return (
    <div className="stack" data-el="admin.dataHealthPanel">
      <FilterBar
        label="Filter health alerts"
        count={pluralize(ops.activeAlertCount, 'active alert')}
      >
        <FilterBar.Picker
          label="Severity"
          value={severity}
          onValueChange={setSeverity}
          options={[
            { value: '', label: 'All severities' },
            ...severities.map((value) => ({
              value,
              label: humanizeKey(value),
              count: ops.activeAlerts.filter((alert) => alert.severity === value).length,
            })),
          ]}
        />
        <span className="type-caption">Severity counts cover this page.</span>
      </FilterBar>
      {healthyChecks > 0 ? (
        <p className="type-caption" role="status">
          {pluralize(healthyChecks, 'configuration check')} healthy.
        </p>
      ) : null}
      <Card className={`stack ${styles.panel}`}>
        <h2 className="type-title">Needs attention</h2>
        <AdminPagination page={alertPage} />
        {ops.activeAlertCount === 0 ? (
          <EmptyState
            kind="no-events"
            message="All clear. No problems are being reported."
            actionLabel="Check again"
            onAction={view.retry}
          />
        ) : alerts.length === 0 ? (
          <EmptyState
            kind="no-results"
            message={severity ? 'No alerts with this severity on this page.' : 'No alerts on this page.'}
            actionLabel={severity ? 'Show all severities' : 'Refresh checks'}
            onAction={severity ? () => setSeverity('') : view.retry}
          />
        ) : (
          <ul className={styles.list} aria-label="Active alerts">
            {alerts.map((alert) => (
              <AdminAlertRow key={alert.key} alert={alert} className={styles.item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
