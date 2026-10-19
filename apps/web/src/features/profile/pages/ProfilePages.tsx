import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { DmTablePanel } from '../../../components/domain/DmTablePanel.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Card } from '../../../components/primitives/Card.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDmTableDetailPage } from '../hooks/useDmTableDetailPage.js';
import {
  normalizeHandle,
  useProfileBody,
} from '../hooks/useProfileBody.js';

function ProfileBody({
  role,
  shortCode,
}: {
  role: 'dm' | 'player';
  shortCode: string;
}): React.JSX.Element {
  const page = useProfileBody(role, shortCode);

  if (page.status === 'error') {
    return <StatePanel status="error" error={page.error} />;
  }
  if (page.status === 'loading') {
    return <StatePanel status="loading" />;
  }
  if (page.status === 'empty') {
    return <EmptyState kind="generic" message="Profile not found in the directory." />;
  }

  const { member } = page;
  return (
    <Card className="stack">
      <p className="type-caption">@{member.handle}</p>
      <p className="type-body">{member.tagline ?? 'No tagline yet.'}</p>
      {member.isDm ? (
        <p className="type-caption">
          {member.acceptingPlayers ? 'Accepting players' : 'Not accepting players'}
        </p>
      ) : null}
      <Link className="type-link" to={member.isDm ? '/dms' : '/players'}>
        Back to directory
      </Link>
    </Card>
  );
}

export function PlayerProfilePage(): React.JSX.Element {
  const { shortCode = '' } = useParams();
  return (
    <SingleRegionPage page="player-profile">
      <p className="eyebrow">Player</p>
      <h1 className="type-display">{normalizeHandle(shortCode) || 'Player'}</h1>
      <ProfileBody role="player" shortCode={shortCode} />
    </SingleRegionPage>
  );
}

export function DMProfilePage(): React.JSX.Element {
  const { shortCode = '' } = useParams();
  return (
    <SingleRegionPage page="dm-profile">
      <p className="eyebrow">Dungeon Master</p>
      <h1 className="type-display">{normalizeHandle(shortCode) || 'DM'}</h1>
      <ProfileBody role="dm" shortCode={shortCode} />
    </SingleRegionPage>
  );
}

export function DmTableDetailPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const { hub, doc, host, schedule, title, loading, error } =
    useDmTableDetailPage(slug);

  return (
    <SingleRegionPage page="dm-table-detail">
      <p className="eyebrow">DM table</p>
      <h1 className="type-display">{title || 'Table'}</h1>
      {error ? (
        <StatePanel
          status="error"
          error={toAppError(hub.error ?? doc.error, 'dm-table:detail')}
        />
      ) : loading ? (
        <StatePanel status="loading" />
      ) : (
        <div className="stack">
          {doc.data ? (
            <DmTablePanel
              table={{
                title: doc.data.title,
                blurb: doc.data.blurb,
                tags: doc.data.tags,
                body: doc.data.body,
                status: doc.data.status,
                slug: doc.data.slug,
              }}
            >
              {doc.data.authorHandle || host ? (
                <p className="type-body">
                  Hosted by{' '}
                  <Link
                    className="type-link"
                    to={`/dms/@${doc.data.authorHandle ?? host?.handle}`}
                  >
                    @{doc.data.authorHandle ?? host?.handle}
                  </Link>
                </p>
              ) : null}
            </DmTablePanel>
          ) : (
            <Card className="stack" data-component="DmTablePanel">
              <p className="type-caption">Slug · {slug}</p>
              {host ? (
                <>
                  <p className="type-body">
                    Hosted by{' '}
                    <Link className="type-link" to={`/dms/@${host.handle}`}>
                      @{host.handle}
                    </Link>
                  </p>
                  <p className="type-caption">
                    {host.tagline ??
                      (host.acceptingPlayers ? 'Accepting players' : 'DM table')}
                  </p>
                  <p className="type-caption">
                    No published dm_table document for this slug — host resolved from
                    the community directory.
                  </p>
                </>
              ) : (
                <EmptyState
                  kind="generic"
                  message="No matching DM table in the community directory for this slug."
                />
              )}
            </Card>
          )}
          <Card className="stack" data-el="dmTable.schedule">
            <h2 className="type-heading">Schedule</h2>
            {schedule.isError ? (
              <StatePanel
                status="error"
                error={toAppError(schedule.error, 'dm-table:schedule')}
              />
            ) : schedule.isLoading ? (
              <StatePanel status="loading" />
            ) : !schedule.data?.length ? (
              <EmptyState kind="schedule-empty" />
            ) : (
              <ul className="stack">
                {schedule.data.map((session) => (
                  <li key={session.id}>
                    <Link className="type-link" to={`/quests/${session.shortCode}`}>
                      {session.title}
                    </Link>
                    <p className="type-caption">
                      {session.scheduledAt} · {session.status} · {session.filledCount}/
                      {session.slotsMax} seats
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Link className="type-link" to="/community">
            Back to community
          </Link>
        </div>
      )}
    </SingleRegionPage>
  );
}
