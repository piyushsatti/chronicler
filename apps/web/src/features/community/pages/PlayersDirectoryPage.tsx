import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCommunityDirectoryPage } from '../hooks/useCommunityDirectoryPage.js';

const DECLARATION: PageDeclaration = {
  page: 'players-directory',
  regions: [{ role: 'body', priority: 1 }],
};

export function PlayersDirectoryPage(): React.JSX.Element {
  const page = useCommunityDirectoryPage('player');

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else if (page.status === 'empty') {
    regions = {
      body: () => <StatePanel status="empty" emptyMessage="No players listed." />,
    };
  } else {
    regions = {
      body: () => (
        <div className="stack">
          <Link className="type-caption" to="/community">
            ← Community
          </Link>
          <h1 className="type-heading">Players</h1>
          <ul className="stack">
            {page.view.map((member) => (
              <li key={member.memberId} className="card stack">
                <p className="type-title">{member.displayName}</p>
                <p className="type-caption">@{member.handle}</p>
                {member.lookingToPlay ? (
                  <p className="type-caption">Looking to play</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  }

  return (
    <PageShell title="Players">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
