import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCommunityPage } from '../hooks/useCommunityPage.js';

const DECLARATION: PageDeclaration = {
  page: 'community',
  regions: [{ role: 'body', priority: 1 }],
};

export function CommunityPage(): React.JSX.Element {
  const page = useCommunityPage();

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const hub = page.view;
    regions = {
      body: () => (
        <div className="stack">
          <header className="stack">
            <p className="eyebrow">The server · Players &amp; DMs</p>
            <h1 className="type-heading">Community</h1>
            <p className="type-body">
              See who&apos;s free, find a table, and browse everyone on the server.
            </p>
            <p className="type-caption">{hub.memberCount} members in the directory</p>
          </header>
          <nav className="row" aria-label="Community sections">
            <Link className="btn" to="/dms">
              DMs · {hub.dms.length}
            </Link>
            <Link className="btn" to="/players">
              Players · {hub.players.length}
            </Link>
            <Link className="btn primary" to="/characters">
              Characters
            </Link>
          </nav>
          <section className="stack" aria-label="DMs accepting">
            <h2 className="type-title">DMs accepting players</h2>
            <ul className="stack">
              {hub.dms
                .filter((dm) => dm.acceptingPlayers)
                .map((dm) => (
                  <li key={dm.memberId} className="card stack">
                    <p className="type-title">{dm.displayName}</p>
                    <p className="type-caption">@{dm.handle}</p>
                    {dm.tagline ? <p className="type-body">{dm.tagline}</p> : null}
                  </li>
                ))}
            </ul>
          </section>
        </div>
      ),
    };
  }

  return (
    <PageShell title="Community">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
