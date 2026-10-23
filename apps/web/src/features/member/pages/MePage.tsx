import { Link, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMe } from '../../../hooks/useMe.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { toAppError } from '../../../errors/toAppError.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import {
  characterStatusLabel,
  personName,
  pluralize,
  roleLabel,
  statusLabel,
} from '../../../utils/format.js';
import { PrivateNotesPanel } from '../components/PrivateNotes.js';
import { usePrivateNotes } from '../hooks/usePrivateNotes.js';
import type { RosterCharacter } from '../adapters/memberHubAdapter.js';
import { useMemberHub, type MemberHub } from '../hooks/useMemberHub.js';
import type { MemberViewModel } from '../adapters/memberAdapter.js';
import styles from './me.module.css';

const TAB_IDS = ['overview', 'characters', 'notes'] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(value: string | null): value is TabId {
  return TAB_IDS.some((id) => id === value);
}

function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function ProfileHero({
  me,
  avatarUrl,
}: {
  me: MemberViewModel;
  avatarUrl: string | undefined;
}): React.JSX.Element {
  const { logout } = useAuth();
  const adminAccess = useCurrentAccess('admin');
  const isDm = me.roles.includes('dm');
  const name = personName(me);
  const publicPath = `/${isDm ? 'dms' : 'players'}/@${me.handle}`;
  return (
    <Card as="section" pad={5} className={styles.hero} aria-label="Your profile">
      <div className={styles.heroBody}>
        <Avatar name={name} src={avatarUrl} size="lg" ring="accent" />
        <div className={styles.identity}>
          <h1 className="type-display">{name}</h1>
          <p className="type-caption">@{me.handle}</p>
          <div className={styles.chips}>
            {me.roles.map((role) => (
              <Chip key={role} size="sm" tone="line">
                {roleLabel(role)}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.actions}>
          <Link className="btn btn--secondary" to="/me/personalize">
            Personalize
          </Link>
          <Link className="btn btn--secondary" to="/settings">
            Settings
          </Link>
          {isDm ? (
            <Link className="btn btn--secondary" to="/dm">
              DM dashboard
            </Link>
          ) : null}
          {adminAccess.allowed ? (
            <Link className="btn btn--secondary" to="/admin">
              Admin
            </Link>
          ) : null}
          <Link className="btn btn--ghost" to={publicPath}>
            View public profile
          </Link>
          <Button variant="ghost" className={styles.signOut} onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatRow({ data }: { data: MemberHub }): React.JSX.Element | null {
  const { formatDate } = useDateFormatter();
  if (data.hub.status === 'error') return null;
  if (data.hub.status === 'loading') {
    return <Skeleton height="5rem" aria-label="Loading your stats" />;
  }
  const { stats, joinedAt } = data.hub.data;
  const tiles: Array<{ label: string; value: string | number }> = [];
  if (stats.questsPlayed > 0) {
    tiles.push({ label: 'Quests played', value: stats.questsPlayed });
  }
  if (data.roster.status === 'ready') {
    tiles.push({ label: 'Characters', value: data.roster.data.length });
  }
  if (stats.summariesAuthored > 0) {
    tiles.push({ label: 'Summaries written', value: stats.summariesAuthored });
  }
  if (stats.voiceMinutes > 0) {
    tiles.push({ label: 'Voice time', value: formatHours(stats.voiceMinutes) });
  }
  if (stats.messages > 0) {
    tiles.push({ label: 'Messages', value: Math.round(stats.messages) });
  }
  tiles.push({ label: 'Member since', value: formatDate(joinedAt) });
  return (
    <div className={styles.stats} role="list" aria-label="Your stats">
      {tiles.map((tile) => (
        <div key={tile.label} role="listitem">
          {/* One size for every tile so labels and values share a baseline
              (a date in the display face would not fit a phone column). */}
          <StatTile label={tile.label} value={tile.value} size="sm" />
        </div>
      ))}
    </div>
  );
}

function Overview({ data }: { data: MemberHub }): React.JSX.Element {
  const { formatScheduled, formatDateTime } = useDateFormatter();
  const sessions = data.hub.status === 'ready' ? data.hub.data.recentSessions : [];
  return (
    <div className={styles.overview}>
      <section className="stack" data-gap="3" aria-labelledby="me-upcoming">
        <div className={styles.sectionHead}>
          <h2 id="me-upcoming" className="type-heading">
            Upcoming sign-ups
          </h2>
          {data.upcoming.status === 'ready' && data.upcoming.data.length > 0 ? (
            <Link className="type-link" to="/quests">
              Browse quests
            </Link>
          ) : null}
        </div>
        {data.upcoming.status === 'error' ? (
          <StatePanel
            variant="inline"
            status="error"
            error={data.upcoming.error}
            onRetry={data.retry}
            retryLabel="Retry sign-ups"
          />
        ) : data.upcoming.status === 'loading' ? (
          <Skeleton height="4rem" aria-label="Loading your sign-ups" />
        ) : data.upcoming.data.length === 0 ? (
          <EmptyState
            message="No upcoming sign-ups."
            action={
              <Link className="btn btn--sm" to="/quests">
                Find a quest
              </Link>
            }
          />
        ) : (
          <ul className={styles.list}>
            {data.upcoming.data.map((item) => (
              <li key={item.questId}>
                <Card variant="clickable" to={`/quests/${item.shortCode}`} pad={4}>
                  <div className={styles.rowCard}>
                    <div className={styles.rowMain}>
                      <p className="type-label">{statusLabel(item.status)}</p>
                      <h3 className="type-title">{item.title}</h3>
                      <p className="type-caption">as {item.characterName}</p>
                    </div>
                    <p className="type-caption">{formatScheduled(item.scheduledAt)}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      {sessions.length > 0 ? (
        <section className="stack" data-gap="3" aria-labelledby="me-activity">
          <h2 id="me-activity" className="type-heading">
            Recent activity
          </h2>
          <ul className={styles.list}>
            {sessions.map((session, index) => (
              <li key={`${session.occurredAt}-${index}`}>
                <Card pad={4}>
                  <div className={styles.rowCard}>
                    <p className="type-body">{session.kind}</p>
                    <p className="type-caption">{formatDateTime(session.occurredAt)}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CharacterTile({
  character,
}: {
  character: RosterCharacter;
}): React.JSX.Element {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} pad={4}>
      <div className={styles.charRow}>
        <span aria-hidden>
          <Avatar
            name={initials || '?'}
            src={character.imageUrl ?? undefined}
            size="md"
          />
        </span>
        <div className={styles.rowMain}>
          <p className="type-label">{characterStatusLabel(character.status)}</p>
          <h3 className="type-title">{character.name}</h3>
          <p className="type-caption">{character.detail || 'Character'}</p>
        </div>
      </div>
    </Card>
  );
}

function Roster({ data }: { data: MemberHub }): React.JSX.Element {
  const { roster } = data;
  const create = (
    <Link className="btn btn--primary" to="/characters?new=1">
      Create a character
    </Link>
  );
  return (
    <div className={styles.overview}>
      <div className={styles.sectionHead}>
        <h2 className="type-heading">
          {roster.status === 'ready'
            ? pluralize(roster.data.length, 'character')
            : 'Your characters'}
        </h2>
        {roster.status === 'ready' && roster.data.length === 0 ? null : create}
      </div>
      {roster.status === 'error' ? (
        <StatePanel
          variant="inline"
          status="error"
          error={roster.error}
          onRetry={data.retry}
          retryLabel="Retry characters"
        />
      ) : roster.status === 'loading' ? (
        <Skeleton height="6rem" aria-label="Loading your characters" />
      ) : roster.data.length === 0 ? (
        <EmptyState
          message="You have no characters yet. Create one to sign up for quests."
          action={create}
        />
      ) : (
        <CardGrid as="ul" gap={4} aria-label="Your characters">
          {roster.data.map((character) => (
            <li key={character.id}>
              <CharacterTile character={character} />
            </li>
          ))}
        </CardGrid>
      )}
    </div>
  );
}

function MeBody(): React.JSX.Element {
  const meQ = useMe();

  if (meQ.isError) {
    return (
      <PageShell>
        <SingleRegionPage page="me">
          <StatePanel status="error" error={toAppError(meQ.error, 'me:page')} />
        </SingleRegionPage>
      </PageShell>
    );
  }

  if (meQ.isLoading || !meQ.data) {
    return (
      <PageShell>
        <SingleRegionPage page="me">
          <StatePanel status="loading" />
        </SingleRegionPage>
      </PageShell>
    );
  }

  return <MeHub me={meQ.data} />;
}

function MeHub({ me }: { me: MemberViewModel }): React.JSX.Element {
  const data = useMemberHub(me.id);
  const notes = usePrivateNotes();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = isTabId(requested) ? requested : 'overview';
  const selectTab = (id: string): void => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'overview') next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  };
  const isDm = me.roles.includes('dm');

  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="me">
        <div className={styles.body}>
          <ProfileHero
            me={me}
            avatarUrl={
              data.hub.status === 'ready'
                ? (data.hub.data.avatarUrl ?? undefined)
                : undefined
            }
          />
          {data.hub.status === 'error' ? (
            <StatePanel
              variant="inline"
              status="error"
              error={data.hub.error}
              onRetry={data.retry}
              retryLabel="Retry your stats"
            />
          ) : null}
          <StatRow data={data} />
          <Tabs
            aria-label="Your account sections"
            value={tab}
            onValueChange={selectTab}
            items={[
              { id: 'overview', label: 'Overview', panel: <Overview data={data} /> },
              {
                id: 'characters',
                label: 'Characters',
                panel: <Roster data={data} />,
              },
              { id: 'notes', label: 'Notes', panel: <PrivateNotesPanel notes={notes} /> },
            ]}
          />
          {isDm ? (
            <Card as="section" pad={4} className={styles.dmPanel} aria-label="DM mode">
              <div>
                <p className="type-label">DM mode</p>
                <p className="type-body">
                  Full DM statistics and quest management live on the DM dashboard.
                </p>
              </div>
              <Link className="btn btn--secondary" to="/dm">
                Open DM dashboard
              </Link>
            </Card>
          ) : null}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

export function MePage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <MeBody />
    </ProtectedRoute>
  );
}
