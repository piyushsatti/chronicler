import { Link } from 'react-router-dom';
import { Chip } from '../../../components/primitives/Chip.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey } from '../../../utils/format.js';
import { isSafeInternalPath } from '../../../utils/url.js';

export type AdminAlert = {
  key: string;
  label: string;
  severity: string;
  remediationHref: string;
  lastSeenAt?: string | null;
};

function severityTone(severity: string): 'danger' | 'warning' | 'line' {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'error') return 'danger';
  if (value === 'warning') return 'warning';
  return 'line';
}

/** One alert, the same on Today, Delivery and Data health. */
export function AdminAlertRow({
  alert,
  className,
}: {
  alert: AdminAlert;
  className?: string;
}): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  return (
    <li className={className}>
      <div className="stack" data-gap="1">
        <span className="type-title">{alert.label}</span>
        {alert.lastSeenAt ? (
          <span className="type-caption">
            Last seen {formatDateTime(alert.lastSeenAt)}
          </span>
        ) : null}
      </div>
      <div className="row" data-gap="2" data-align="center" data-wrap="1">
        <Chip tone={severityTone(alert.severity)} size="sm">
          {humanizeKey(alert.severity)}
        </Chip>
        {isSafeInternalPath(alert.remediationHref) ? (
          <Link className="btn btn--secondary btn--sm" to={alert.remediationHref}>
            View details
          </Link>
        ) : null}
      </div>
    </li>
  );
}
