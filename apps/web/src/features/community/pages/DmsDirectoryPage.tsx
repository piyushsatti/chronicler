import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCommunityDirectoryPage } from '../hooks/useCommunityDirectoryPage.js';

const DECLARATION: PageDeclaration = {
  page: 'dms-directory',
  regions: [{ role: 'body', priority: 1 }],
};

export function DmsDirectoryPage(): React.JSX.Element {
  const page = useCommunityDirectoryPage('dm');

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else if (page.status === 'empty') {
    regions = {
      body: () => <StatePanel status="empty" emptyMessage="No DMs listed." />,
    };
  } else {
    regions = {
      body: () => (
        <div className="stack">
          <Link className="type-caption" to="/community">
            ← Community
          </Link>
          <h1 className="type-heading">Dungeon Masters</h1>
          <ul className="stack">
            {page.view.map((member) => (
              <li key={member.memberId} className="card stack">
                <p className="type-title">{member.displayName}</p>
                <p className="type-caption">@{member.handle}</p>
                {member.acceptingPlayers ? (
                  <p className="type-caption">Accepting players</p>
                ) : null}
                {member.tagline ? <p className="type-body">{member.tagline}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  }

  return (
    <PageShell title="DMs">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
