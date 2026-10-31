import { Link } from 'react-router-dom';
import { hasRole, isAdmin } from '../../auth/roles.js';
import { useMe } from '../../hooks/useMe.js';
import { useSeriesPage } from '../../hooks/useSeriesPage.js';

const STATUS_COPY: Record<string, string> = {
  draft: 'not submitted for review yet',
  pending: 'pending review',
  rejected: 'rejected; update it and submit it again',
};

function statusCopy(status: string | null): string {
  if (status === null) return 'not submitted for review yet';
  return STATUS_COPY[status] ?? `in review status “${status}”`;
}

/** Tells a DM (or an admin, who posts quests as themselves) that posting quests and
 * starting a series wait on an approved DM profile. Reads the same proof as the
 * series-create check; renders nothing until it is known, or once the profile is approved. */
export function DmApprovalNotice(): React.JSX.Element | null {
  const me = useMe().data;
  const page = useSeriesPage('');
  if (!me || page.dmStatus === undefined || page.dmStatus === 'approved') return null;
  if (!hasRole(me.roles, 'dm') && !isAdmin(me.roles)) return null;
  return (
    <section
      className="card stack"
      data-component="DmApprovalNotice"
      data-status={page.dmStatus ?? 'none'}
      data-gap="2"
      role="status"
      aria-label="DM profile approval"
    >
      <h2 className="type-label">Your DM profile needs approval</h2>
      <p className="type-body">
        Your DM profile is {statusCopy(page.dmStatus)}. Until it is approved you
        can’t post quests or start a series.
      </p>
      <p>
        <Link
          className="btn btn--secondary"
          to={`/dms/@${encodeURIComponent(me.handle)}?edit=profile`}
        >
          Open your DM profile
        </Link>
      </p>
    </section>
  );
}
