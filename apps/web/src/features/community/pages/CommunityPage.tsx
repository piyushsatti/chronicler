import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useCommunityPage } from '../hooks/useCommunityPage.js';
import type { CommunityMemberView } from '../types.js';

const DECLARATION: PageDeclaration = {
  page: 'community',
  regions: [{ role: 'body', priority: 1 }],
};

function MemberList({
  members,
  empty,
  profileBase,
}: {
  members: CommunityMemberView[];
  empty: string;
  profileBase: '/dms' | '/players';
}): React.JSX.Element {
  if (members.length === 0) {
    return <EmptyState kind="generic" message={empty} />;
  }
  return (
    <ul className="stack">
      {members.map((member) => (
        <li key={member.memberId}>
          <Card className="stack">
            <Link className="type-title" to={`${profileBase}/@${member.handle}`}>
              {member.displayName}
            </Link>
            <p className="type-caption">@{member.handle}</p>
            {member.tagline ? <p className="type-body">{member.tagline}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

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
          <Tabs
            items={[
              {
                id: 'muster',
                label: 'Muster',
                panel: (
                  <MemberList
                    members={hub.dms.filter((dm) => dm.acceptingPlayers)}
                    empty="No DMs are accepting players right now."
                    profileBase="/dms"
                  />
                ),
              },
              {
                id: 'dms',
                label: 'DMs',
                panel: (
                  <MemberList
                    members={hub.dms}
                    empty="No DMs in the directory."
                    profileBase="/dms"
                  />
                ),
              },
              {
                id: 'players',
                label: 'Players',
                panel: (
                  <MemberList
                    members={hub.players}
                    empty="No players in the directory."
                    profileBase="/players"
                  />
                ),
              },
            ]}
          />
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
