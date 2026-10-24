import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useDmDashboard } from '../../../hooks/useDmDashboard.js';
import { characterStatusLabel, pluralize, statusLabel } from '../../../utils/format.js';
import { PrivateNotesPanel } from '../components/PrivateNotes.js';
import { usePrivateNotes } from '../hooks/usePrivateNotes.js';
import type { RosterCharacter } from '../adapters/memberHubAdapter.js';
import type { MemberHub } from '../hooks/useMemberHub.js';
import { MeShell, type MeShellState } from '../../../chrome/MeShell.js';
import styles from './me.module.css';

const LEGACY_ME_TABS: Record<string, string> = {
  overview: '/me',
  characters: '/me/characters',
  notes: '/me/notes',
  personalize: '/me/personalize',
  settings: '/me/settings',
};

function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function StatRow({ data }: { data: MemberHub }): React.JSX.Element | null {
  const { formatDate } = useDateFormatter();
  if (data.hub.status === 'error') return <StatePanel variant="inline" status="error" error={data.hub.error} onRetry={data.retry} retryLabel="Retry your stats" />;
  if (data.hub.status === 'loading') {
    return <Skeleton height="5rem" aria-label="Loading your stats" />;
  }
  const { stats, joinedAt } = data.hub.data;
  const tiles: Array<{ label: string; value: string | number }> = [
    { label: 'Quests played', value: stats.questsPlayed },
  ];
  if (data.roster.status === 'ready') tiles.unshift({ label: data.roster.data.length === 1 ? 'Character' : 'Characters', value: data.roster.data.length });
  if (stats.summariesAuthored > 0) tiles.push({ label: 'Summaries written', value: stats.summariesAuthored });
  if (stats.voiceMinutes > 0) tiles.push({ label: 'Voice time', value: formatHours(stats.voiceMinutes) });
  if (stats.messages > 0) tiles.push({ label: 'Messages', value: Math.round(stats.messages) });
  tiles.push({ label: 'Member since', value: formatDate(joinedAt) });
  return (
    <p className={styles.stats} aria-label="Your stats">
      {tiles.map((tile) => <span key={tile.label}>{tile.label === 'Member since' ? <>Member since <strong>{tile.value}</strong></> : <><strong>{tile.value}</strong> {tile.label.toLowerCase()}</>}</span>)}
    </p>
  );
}

function characterInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function CharacterTile({ character }: { character: RosterCharacter }): React.JSX.Element {
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} pad={4}>
      <div className={styles.charRow}>
        <span aria-hidden><Avatar name={characterInitials(character.name)} src={character.imageUrl ?? undefined} size="md" /></span>
        <div className={styles.rowMain}>
          <h3 className="type-title">{character.name}</h3>
          <p className="type-label">{characterStatusLabel(character.status)}</p>
          {character.detail ? <p className="type-caption">{character.detail}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function UpcomingSignups({ data }: { data: MemberHub }): React.JSX.Element {
  const { formatScheduled } = useDateFormatter();
  return (
    <section className="stack" data-gap="3" aria-labelledby="me-upcoming">
      <div className={styles.sectionHead}>
        <h2 id="me-upcoming" className="type-heading">Upcoming sign-ups</h2>
        {data.upcoming.status === 'ready' && data.upcoming.data.length > 0 ? <Link className="type-link" to="/quests">Browse quests</Link> : null}
      </div>
      {data.upcoming.status === 'error' ? (
        <StatePanel variant="inline" status="error" error={data.upcoming.error} onRetry={data.retry} retryLabel="Retry sign-ups" />
      ) : data.upcoming.status === 'loading' ? (
        <Skeleton height="4rem" aria-label="Loading your sign-ups" />
      ) : data.upcoming.data.length === 0 ? (
        <div className={styles.signupEmpty}>
          <p className="type-caption">No upcoming sign-ups.</p>
          <Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {data.upcoming.data.map((item) => (
            <li key={item.questId}>
              <Card variant="clickable" to={`/quests/${item.shortCode}`} pad={4}>
                <div className={styles.rowCard}>
                  <div className={styles.rowMain}><p className="type-label">{statusLabel(item.status)}</p><h3 className="type-title">{item.title}</h3><p className="type-caption">as {item.characterName}</p></div>
                  <p className="type-caption">{formatScheduled(item.scheduledAt)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesEntry({ notes }: { notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  return (
    <section className={`card stack ${styles.notesEntry}`} aria-labelledby="me-notes">
      <div className={styles.sectionHead}><h2 id="me-notes" className="type-heading">Private notes</h2><Link className="type-link" to="/me/notes">Open notes</Link></div>
      {notes.status === 'loading' ? <Skeleton height="3rem" aria-label="Loading private notes" />
        : notes.status === 'error' ? <StatePanel variant="inline" status="error" error={notes.error} onRetry={notes.retry} retryLabel="Retry notes" />
            : notes.text.trim() ? <div className={styles.notesExcerpt}><ContentRenderer body={notes.text.slice(0, 220)} /></div>
            : <p className="type-caption">No private notes yet.</p>}
      <p className="type-caption">Only you can see these.</p>
    </section>
  );
}

function CharacterStrip({ data, showEmpty = true }: { data: MemberHub; showEmpty?: boolean }): React.JSX.Element | null {
  const characters = data.roster.status === 'ready' ? data.roster.data : [];
  if (!showEmpty && (data.roster.status !== 'ready' || characters.length === 0)) return null;
  return (
    <section className={`stack ${styles.characterSection}`} data-gap="3" aria-labelledby="me-characters">
      <div className={styles.sectionHead}><h2 id="me-characters" className="type-heading">{characters.length === 1 ? 'Your character' : 'Your characters'}</h2><Link className="type-link" to="/me/characters">All characters</Link></div>
      {data.roster.status === 'error' ? <StatePanel variant="inline" status="error" error={data.roster.error} onRetry={data.retry} retryLabel="Retry characters" />
        : data.roster.status === 'loading' ? <Skeleton height="6rem" aria-label="Loading your characters" />
          : characters.length === 0 ? <EmptyState message="You have no characters yet." action={<Link className="btn btn--secondary btn--sm" to="/characters?new=1">Create a character</Link>} />
            : <CardGrid as="ul" gap={3} aria-label="Your characters" className={styles.characterStrip}>{characters.slice(0, 3).map((character) => <li key={character.id}><CharacterTile character={character} /></li>)}</CardGrid>}
    </section>
  );
}

function PlayerOverview({ data, notes }: { data: MemberHub; notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  const sessions = data.hub.status === 'ready' ? data.hub.data.recentSessions : [];
  const nothingHere = data.upcoming.status === 'ready' && data.upcoming.data.length === 0 &&
    data.roster.status === 'ready' && data.roster.data.length === 0 && notes.status === 'empty' && sessions.length === 0;
  return (
    <>
      <StatRow data={data} />
      <div className={styles.overview}>
        {nothingHere ? (
          <Card className="stack" as="section" aria-label="Your campaign activity">
            <div><p className="type-label">Your campaign activity</p><h2 className="type-heading">Nothing here yet</h2><p className="type-caption">Your sign-ups, characters and private notes will appear here.</p></div>
            <div className={styles.dmActions}><Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link><Link className="btn btn--secondary btn--sm" to="/characters?new=1">Create a character</Link><Link className="btn btn--secondary btn--sm" to="/me/notes">Add private notes</Link></div>
          </Card>
        ) : <div className={styles.dashboardMain}>
          <UpcomingSignups data={data} />
          <CharacterStrip data={data} />
          {sessions.length > 0 ? <RecentActivity data={data} /> : null}
        </div>}
        {nothingHere ? null : <NotesEntry notes={notes} />}
      </div>
    </>
  );
}

function RecentActivity({ data }: { data: MemberHub }): React.JSX.Element | null {
  const { formatDateTime } = useDateFormatter();
  const sessions = data.hub.status === 'ready' ? data.hub.data.recentSessions : [];
  if (sessions.length === 0) return null;
  return <section className="stack" data-gap="3" aria-labelledby="me-activity"><h2 id="me-activity" className="type-heading">Recent activity</h2><ul className={styles.list}>{sessions.map((session, index) => <li key={`${session.occurredAt}-${index}`}><Card pad={4}><div className={styles.rowCard}><p className="type-body">{session.kind}</p><p className="type-caption">{formatDateTime(session.occurredAt)}</p></div></Card></li>)}</ul></section>;
}

function DmWork({ view }: { view: ReturnType<typeof useDmDashboard> }): React.JSX.Element | null {
  const { query } = view;
  if (query.isError) return <StatePanel variant="inline" status="error" error={query.error} onRetry={view.retry} retryLabel="Retry DM work" />;
  if (query.isLoading || !query.data) return <Skeleton height="8rem" aria-label="Loading your tables, series and quests" />;
  const { data } = query;
  const upcoming = data.quests.items.filter((quest) => !['played', 'closed', 'cancelled'].includes(quest.status));
  const hasHostedWork = data.documents.total + data.series.length + upcoming.length > 0;
  return (
    <Card className="stack" as="section" aria-label="Your tables, series and quests">
      <div className={styles.sectionHead}><h2 className="type-heading">Your tables, series and quests</h2></div>
      {hasHostedWork ? <CardGrid as="ul" gap={3} aria-label="Your hosted work">
        <li><div className="card stack"><h3 className="type-title">DM tables</h3><p className="type-caption">{pluralize(data.documents.total, 'table')}</p>{data.documents.items.slice(0, 3).map((table) => <Link className="type-link" key={table.id} to={`/community/dm-table/${table.slug}`}>{table.title}</Link>)}{data.documents.total === 0 ? <Link className="type-link" to="/editor/dm-table">New DM table</Link> : null}</div></li>
        <li><div className="card stack"><h3 className="type-title">Series</h3><p className="type-caption">{pluralize(data.series.length, 'series')}</p>{data.series.slice(0, 3).map((series) => <Link className="type-link" key={series.id} to={`/series/${encodeURIComponent(series.id)}`}>{series.name}</Link>)}{data.series.length === 0 ? <Link className="type-link" to="/series/new">Create a series</Link> : null}</div></li>
        <li><div className="card stack"><h3 className="type-title">Quests to run</h3><p className="type-caption">{pluralize(upcoming.length, 'quest')}</p>{upcoming.slice(0, 3).map((quest) => <Link className="type-link" key={quest.id} to={`/quests/${quest.shortCode}`}>{quest.briefDocument?.title ?? 'Untitled quest'}</Link>)}{upcoming.length === 0 && view.canCreateQuest ? <Link className="type-link" to="/quests/new">Post a quest</Link> : null}</div></li>
      </CardGrid> : <div className={styles.dmActions}>
        <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">New DM table</Link>
        <Link className="btn btn--secondary btn--sm" to="/series/new">Create a series</Link>
        {view.canCreateQuest ? <Link className="btn btn--primary btn--sm" to="/quests/new">Post a quest</Link> : null}
      </div>}
    </Card>
  );
}

function DmOverview({ data, notes }: { data: MemberHub; notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  const view = useDmDashboard('all');
  const adminAccess = useCurrentAccess('admin');
  const noSignups = data.upcoming.status === 'ready' && data.upcoming.data.length === 0;
  const sessions = data.hub.status === 'ready' ? data.hub.data.recentSessions : [];
  const noDmWork = view.query.isSuccess && view.query.data !== undefined && view.query.data.documents.total === 0 && view.query.data.series.length === 0 && view.query.data.quests.total === 0;
  const noCharacters = data.roster.status === 'ready' && data.roster.data.length === 0;
  const nothingHere = noSignups && noDmWork && noCharacters && notes.status === 'empty' && sessions.length === 0;
  return (
    <>
      {nothingHere ? null : <p className={styles.dmDashboardLink}><Link className="type-link" to="/dm">DM dashboard</Link></p>}
      <StatRow data={data} />
      <div className={styles.overview}>
        {nothingHere ? (
          <Card className="stack" as="section" aria-label="Your campaign activity">
            <div className={styles.sectionHead}><div><p className="type-label">Your tables, series and quests</p><h2 className="type-heading">Nothing here yet</h2><p className="type-caption">Your hosted work will appear here.</p></div><Link className="btn btn--secondary btn--sm" to="/dm">DM dashboard</Link></div>
            <div className={styles.dmActions}><Link className="btn btn--secondary btn--sm" to="/editor/dm-table">New DM table</Link><Link className="btn btn--secondary btn--sm" to="/series/new">Create a series</Link>{view.canCreateQuest ? <Link className="btn btn--primary btn--sm" to="/quests/new">Post a quest</Link> : null}<Link className="btn btn--ghost btn--sm" to="/me/notes">Private notes</Link></div>
          </Card>
        ) : <div className={styles.dashboardMain}>
          <DmWork view={view} />
          <UpcomingSignups data={data} />
          {sessions.length > 0 ? <RecentActivity data={data} /> : null}
          {adminAccess.allowed ? <Card as="section"><Link className="type-link" to="/admin">Admin dashboard</Link></Card> : null}
          <CharacterStrip data={data} showEmpty={false} />
        </div>}
        {nothingHere ? null : <NotesEntry notes={notes} />}
      </div>
    </>
  );
}

function OverviewPage({ me, data, notes }: MeShellState & { notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  return me.roles.includes('dm') ? <DmOverview data={data} notes={notes} /> : <PlayerOverview data={data} notes={notes} />;
}

function RosterPage({ data }: MeShellState): React.JSX.Element {
  const { roster, retry } = data;
  const create = <Link className="btn btn--primary" to="/characters?new=1">Create a character</Link>;
  return (
    <div className={styles.rosterOverview}>
      <div className={styles.rosterHeader}>
        <div><p className="type-label">Your roster</p><h2 className="type-heading">Characters</h2></div>
        {create}
      </div>
      {roster.status === 'error' ? <StatePanel variant="inline" status="error" error={roster.error} onRetry={retry} retryLabel="Retry characters" />
        : roster.status === 'loading' ? <Skeleton height="6rem" aria-label="Loading your characters" />
          : roster.data.length === 0 ? <EmptyState message="You have no characters yet. Create one to sign up for quests." />
            : <CardGrid as="ul" gap={4} aria-label="Your characters">{roster.data.map((character) => <li key={character.id}><CharacterTile character={character} /></li>)}</CardGrid>}
    </div>
  );
}

export function MePage(): React.JSX.Element {
  const [params] = useSearchParams();
  const location = useLocation();
  const notes = usePrivateNotes();
  const legacyTab = params.get('tab');
  if (location.pathname === '/me' && legacyTab !== null) return <Navigate replace to={LEGACY_ME_TABS[legacyTab] ?? '/me'} />;
  const pathname = location.pathname;
  return <MeShell>{(state) => <>
    {pathname === '/me/characters' ? <RosterPage {...state} /> : pathname === '/me/notes' ? null : <OverviewPage {...state} notes={notes} />}
    <div hidden={pathname !== '/me/notes'}><PrivateNotesPanel notes={notes} /></div>
  </>}</MeShell>;
}

export const MeCharactersPage = MePage;
export const MeNotesPage = MePage;
