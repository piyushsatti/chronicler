import { Link, useLocation } from 'react-router-dom';
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

const REMEDIATION_LABELS: Record<string, string> = {
  '/admin/data-health': 'Review diagnostics',
  '/admin/delivery': 'Review delivery',
  '/admin/people': 'Review members',
  '/admin/world': 'Review world settings',
  '/admin/content': 'Review content',
  '/admin/review': 'Review queue',
};

/** Active problems retain the server's label and remediation destination. */
export function AdminAlertRow({
  alert,
  className,
}: {
  alert: AdminAlert;
  className?: string;
}): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const { pathname } = useLocation();
  const destination = alert.remediationHref.split(/[?#]/)[0].replace(/\/+$/, '');
  const canReviewDestination =
    isSafeInternalPath(alert.remediationHref) &&
    destination !== pathname.replace(/\/+$/, '');
  return (
    <li className={className}>
      <div className="stack" data-gap="1">
        <span className="type-title">{alert.label}</span>
        {alert.lastSeenAt ? (
          <span className="type-caption">
            Last seen {formatDateTime(alert.lastSeenAt)}
          </span>
        ) : null}
        {!canReviewDestination ? (
          <span className="type-caption">
            Repair instructions and a separate destination are not provided.
          </span>
        ) : null}
      </div>
      <div className="row" data-gap="2" data-align="center" data-wrap="1">
        <Chip tone={severityTone(alert.severity)} size="sm">
          {humanizeKey(alert.severity)}
        </Chip>
        {canReviewDestination ? (
          <Link className="btn btn--secondary btn--sm" to={alert.remediationHref}>
            {REMEDIATION_LABELS[destination] ?? 'Review linked page'}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
