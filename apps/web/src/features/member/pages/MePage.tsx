import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { SeriesCreateAction } from '../../../components/domain/SeriesCreateAction.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useDmDashboard } from '../../../hooks/useDmDashboard.js';
import { useMe } from '../../../hooks/useMe.js';
import { useProfileActivity } from '../../../hooks/useProfileActivity.js';
import { characterStatusLabel, isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { formatMemberFor, formatVoiceHours } from '../memberFormat.js';
import { useRecentEntries, type RecentEntry, type RecentState } from '../hooks/useRecentEntries.js';
import { PrivateNotesPanel } from '../components/PrivateNotes.js';
import { usePrivateNotes } from '../hooks/usePrivateNotes.js';
import type { RosterCharacter } from '../adapters/memberHubAdapter.js';
import type { MemberHub } from '../hooks/useMemberHub.js';
import { MeShell, type MeShellState } from '../../../chrome/MeShell.js';
import { MeAvailabilityEditor } from '../../../chrome/MeAvailabilityEditor.js';
import { useUrlParam } from '../../../hooks/useUrlParam.js';
import styles from './me.module.css';

const LEGACY_ME_TABS: Record<string, string> = {
  overview: '/me',
  characters: '/me/characters',
  notes: '/me/notes',
  personalize: '/me/personalize',
  settings: '/me/settings',
};

function StatRow({ data }: { data: MemberHub }): React.JSX.Element {
  if (data.hub.status === 'error') return <StatePanel variant="inline" status="error" error={data.hub.error} onRetry={data.retry} retryLabel="Retry your stats" />;
  if (data.hub.status === 'loading') {
    return <Skeleton height="5rem" aria-label="Loading your stats" />;
  }
  const { stats, joinedAt } = data.hub.data;
  const tiles: Array<{ label: string; value: string | number }> = [
    { label: 'Voice hours', value: formatVoiceHours(stats.voiceMinutes) },
    { label: 'Quests played', value: stats.questsPlayed },
    { label: 'Messages', value: Math.round(stats.messages) },
    { label: 'Characters', value: data.roster.status === 'ready' ? data.roster.data.length : '—' },
    { label: 'Member for', value: formatMemberFor(joinedAt) },
  ];
  return (
    <ul className={styles.statRow} aria-label="Your stats" data-el="me.stats">
      {tiles.map((tile) => (
        <li key={tile.label}>
          <Card pad={4} className={styles.statCard}>
            <strong className={styles.statValue}>{tile.value}</strong>
            <span className="type-caption">{tile.label}</span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Milestones since joining. Only cards with real data render; the section is omitted when there is nothing beyond the join date. */
function SinceYouJoined({ data }: { data: MemberHub }): React.JSX.Element | null {
  const { formatDate } = useDateFormatter();
  if (data.hub.status !== 'ready') return null;
  const { stats, joinedAt } = data.hub.data;
  const cards: Array<{ label: string; value: string | number }> = [];
  if (stats.summariesAuthored > 0) cards.push({ label: 'Summaries written', value: stats.summariesAuthored });
  if (stats.longestSessionHours !== null && stats.longestSessionHours > 0) cards.push({ label: 'Longest session', value: `${Math.round(stats.longestSessionHours * 10) / 10}h` });
  if (cards.length === 0) return null;
  cards.push({ label: 'Joined', value: formatDate(joinedAt) });
  return (
    <section className="stack" data-gap="3" aria-labelledby="me-since" data-el="me.since">
      <h2 id="me-since" className="type-heading">Since you joined</h2>
      <ul className={styles.sinceRow}>
        {cards.map((card) => (
          <li key={card.label}>
            <Card pad={4} className={styles.statCard}>
              <strong className={styles.statValue}>{card.value}</strong>
              <span className="type-caption">{card.label}</span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function characterInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function CharacterTile({ character }: { character: RosterCharacter }): React.JSX.Element {
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} className={styles.fillCard} pad={4}>
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

function PlayerOverview({ data, notes, recent }: { data: MemberHub; notes: ReturnType<typeof usePrivateNotes>; recent: RecentState }): React.JSX.Element {
  const noRecent = recent.status === 'ready' && recent.entries.length === 0;
  const nothingHere = data.upcoming.status === 'ready' && data.upcoming.data.length === 0 &&
    data.roster.status === 'ready' && data.roster.data.length === 0 && notes.status === 'empty' && noRecent;
  return (
    <>
      <StatRow data={data} />
      <SinceYouJoined data={data} />
      <RecentActivity recent={recent} />
      <div className={styles.overview}>
        {nothingHere ? (
          <Card className="stack" as="section" aria-label="Your campaign activity">
            <div><p className="type-label">Your campaign activity</p><h2 className="type-heading">Nothing here yet</h2><p className="type-caption">Your sign-ups, characters and private notes will appear here.</p></div>
            <div className={styles.dmActions}><Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link><Link className="btn btn--secondary btn--sm" to="/characters?new=1">Create a character</Link><Link className="btn btn--secondary btn--sm" to="/me/notes">Add private notes</Link></div>
          </Card>
        ) : <div className={styles.dashboardMain}>
          <UpcomingSignups data={data} />
          <CharacterStrip data={data} />
        </div>}
        {nothingHere ? null : <NotesEntry notes={notes} />}
      </div>
    </>
  );
}

function entryBody(entry: RecentEntry): React.JSX.Element {
  return (
    <div className="stack" data-gap="1">
      <h3 className="type-title">{entry.title}{entry.href ? <span aria-hidden="true"> →</span> : null}</h3>
      {entry.meta ? <p className="type-caption">{entry.meta}</p> : null}
    </div>
  );
}

function RecentActivity({ recent }: { recent: RecentState }): React.JSX.Element | null {
  if (recent.status === 'ready' && recent.entries.length === 0) return null;
  return (
    <section className="stack" data-gap="3" aria-labelledby="me-activity" data-el="me.activity">
      <h2 id="me-activity" className="type-heading">Recent activity</h2>
      {recent.status === 'error' ? <StatePanel variant="inline" status="error" error={recent.error} onRetry={recent.retry} retryLabel="Retry recent activity" />
        : recent.status === 'loading' ? <Skeleton height="4rem" aria-label="Loading recent activity" />
          : <ul className={styles.list}>{recent.entries.map((entry) => (
            <li key={entry.key}>
              {entry.href ? <Card pad={4} variant="clickable" to={entry.href}>{entryBody(entry)}</Card> : <Card pad={4}>{entryBody(entry)}</Card>}
            </li>
          ))}</ul>}
    </section>
  );
}

/** A card lists its first three items; the DM dashboard lists the rest. */
function SeeAll({ label }: { label: string }): React.JSX.Element {
  return <Link className="type-link" to="/dm">{label}</Link>;
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
      {hasHostedWork ? <CardGrid as="ul" gap={3} aria-label="Your hosted work" className={styles.hostedGrid}>
        <li><div className="card stack"><h3 className="type-title">DM tables</h3><p className="type-caption">{pluralize(data.documents.total, 'table')}</p>{data.documents.items.slice(0, 3).map((table) => <Link className="type-link" key={table.id} to={`/community/dm-table/${table.slug}`}>{table.title}</Link>)}{data.documents.total > 3 ? <SeeAll label="See all DM tables" /> : null}{data.documents.total === 0 ? <Link className="type-link" to="/editor/dm-table">New DM table</Link> : null}</div></li>
        <li><div className="card stack"><h3 className="type-title">Series</h3><p className="type-caption">{pluralize(data.series.length, 'series')}</p>{data.series.slice(0, 3).map((series) => <Link className="type-link" key={series.id} to={`/series/${encodeURIComponent(series.id)}`}>{series.name}</Link>)}{data.series.length > 3 ? <SeeAll label="See all series" /> : null}<SeriesCreateAction label="Create a series" variant="ghost" size="sm" showAuthorityError={false} /></div></li>
        <li><div className="card stack"><h3 className="type-title">Quests to run</h3><p className="type-caption">{pluralize(upcoming.length, 'quest')}</p>{upcoming.slice(0, 3).map((quest) => <Link className="type-link" key={quest.id} to={`/quests/${quest.shortCode}`}>{quest.briefDocument?.title ?? 'Untitled quest'}</Link>)}{upcoming.length > 3 ? <SeeAll label="See all quests to run" /> : null}{upcoming.length === 0 && view.canCreateQuest ? <Link className="type-link" to="/quests/new">Post a quest</Link> : null}</div></li>
      </CardGrid> : <div className={styles.dmActions}>
        <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">New DM table</Link>
        <SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} />
        {view.canCreateQuest ? <Link className="btn btn--primary btn--sm" to="/quests/new">Post a quest</Link> : null}
      </div>}
    </Card>
  );
}

function DmOverview({ data, notes, recent }: { data: MemberHub; notes: ReturnType<typeof usePrivateNotes>; recent: RecentState }): React.JSX.Element {
  const view = useDmDashboard('all');
  const adminAccess = useCurrentAccess('admin');
  const noSignups = data.upcoming.status === 'ready' && data.upcoming.data.length === 0;
  const noRecent = recent.status === 'ready' && recent.entries.length === 0;
  const noDmWork = view.query.isSuccess && view.query.data !== undefined && view.query.data.documents.total === 0 && view.query.data.series.length === 0 && view.query.data.quests.total === 0;
  const noCharacters = data.roster.status === 'ready' && data.roster.data.length === 0;
  const nothingHere = noSignups && noDmWork && noCharacters && notes.status === 'empty' && noRecent;
  return (
    <>
      {nothingHere ? null : <p className={styles.dmDashboardLink}><Link className="type-link" to="/dm">DM dashboard</Link></p>}
      <StatRow data={data} />
      <SinceYouJoined data={data} />
      <RecentActivity recent={recent} />
      <div className={styles.overview}>
        {nothingHere ? (
          <Card className="stack" as="section" aria-label="Your campaign activity">
            <div className={styles.sectionHead}><div><p className="type-label">Your tables, series and quests</p><h2 className="type-heading">Nothing here yet</h2><p className="type-caption">Your hosted work will appear here.</p></div><Link className="btn btn--secondary btn--sm" to="/dm">DM dashboard</Link></div>
            <div className={styles.dmActions}><Link className="btn btn--secondary btn--sm" to="/editor/dm-table">New DM table</Link><SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} />{view.canCreateQuest ? <Link className="btn btn--primary btn--sm" to="/quests/new">Post a quest</Link> : null}<Link className="btn btn--ghost btn--sm" to="/me/notes">Private notes</Link></div>
          </Card>
        ) : <div className={styles.dashboardMain}>
          <DmWork view={view} />
          <UpcomingSignups data={data} />
          {adminAccess.allowed ? <Card as="section"><Link className="type-link" to="/admin">Admin dashboard</Link></Card> : null}
          <CharacterStrip data={data} showEmpty={false} />
        </div>}
        {nothingHere ? null : <NotesEntry notes={notes} />}
      </div>
    </>
  );
}

function OverviewPage({ me, data, notes }: MeShellState & { notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  const recent = useRecentEntries(me.id, data);
  return me.roles.includes('dm') ? <DmOverview data={data} notes={notes} recent={recent} /> : <PlayerOverview data={data} notes={notes} recent={recent} />;
}

function RosterPage({ data }: MeShellState): React.JSX.Element {
  const { roster, retry } = data;
  return (
    <section className={styles.rosterOverview} aria-labelledby="me-roster">
      <h2 id="me-roster" className={styles.srOnly}>Characters</h2>
      {roster.status === 'error' ? <StatePanel variant="inline" status="error" error={roster.error} onRetry={retry} retryLabel="Retry characters" />
        : roster.status === 'loading' ? <Skeleton height="6rem" aria-label="Loading your characters" />
          : roster.data.length === 0 ? <EmptyState message="You have no characters yet. Create one to sign up for quests." />
            : <CardGrid as="ul" gap={4} aria-label="Your characters">{roster.data.map((character) => <li key={character.id}><CharacterTile character={character} /></li>)}</CardGrid>}
    </section>
  );
}

type Activity = ReturnType<typeof useProfileActivity>;

function HistoryPage({ activity }: { activity: Activity }): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const { history } = activity;
  return (
    <section className="stack" data-gap="3" aria-labelledby="me-history">
      <h2 id="me-history" className={styles.srOnly}>Quest history</h2>
      {history.isError ? <StatePanel variant="inline" status="error" error={toAppError(history.error, 'me:history')} onRetry={activity.retryHistory} retryLabel="Retry quest history" />
        : !history.data ? <Skeleton height="6rem" aria-label="Loading your quest history" />
          : history.data.length === 0 ? <EmptyState message="You have no quest history yet. Quests you play will appear here." />
            : <ul className={styles.list} aria-label="Your quests">{history.data.map((quest) => (
              <li key={quest.key}>
                {quest.href ? <Card pad={4} variant="clickable" to={quest.href}><HistoryRow quest={quest} formatDate={formatDate} /></Card> : <Card pad={4}><HistoryRow quest={quest} formatDate={formatDate} /></Card>}
              </li>
            ))}</ul>}
    </section>
  );
}

function HistoryRow({ quest, formatDate }: { quest: NonNullable<Activity['history']['data']>[number]; formatDate: (value: string) => string }): React.JSX.Element {
  const when = quest.scheduledAt && !isSentinelDate(quest.scheduledAt) ? formatDate(quest.scheduledAt) : null;
  return (
    <div className={styles.rowCard}>
      <div className={styles.rowMain}>{quest.status ? <p className="type-label">{statusLabel(quest.status)}</p> : null}<h3 className="type-title">{quest.label}</h3></div>
      {when ? <p className="type-caption">{when}</p> : null}
    </div>
  );
}

function SummariesPage({ activity }: { activity: Activity }): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const writings = activity.activity;
  return (
    <section className="stack" data-gap="3" aria-labelledby="me-summaries">
      <h2 id="me-summaries" className={styles.srOnly}>Summaries</h2>
      {writings.isError ? <StatePanel variant="inline" status="error" error={toAppError(writings.error, 'me:summaries')} onRetry={activity.retryActivity} retryLabel="Retry summaries" />
        : !writings.data ? <Skeleton height="6rem" aria-label="Loading your summaries" />
          : writings.data.writings.length === 0 ? <EmptyState message="You have not written a summary yet. Summaries you write will appear here." />
            : <CardGrid as="ul" gap={3} aria-label="Your summaries">{writings.data.writings.map((entry) => (
              <li key={entry.id}>
                <Card variant="clickable" to={`/summaries/${entry.slug}`} className={`stack ${styles.fillCard} ${styles.pinCard}`} pad={4}>
                  <h3 className="type-title">{entry.title}</h3>
                  {entry.publishedAt && !isSentinelDate(entry.publishedAt) ? <p className={`type-caption ${styles.pinEnd}`}>{formatDate(entry.publishedAt)}</p> : null}
                </Card>
              </li>
            ))}</CardGrid>}
    </section>
  );
}

type Section = 'overview' | 'characters' | 'history' | 'summaries' | 'notes';

const SECTION_BY_PATH: Record<string, Section> = {
  '/me': 'overview',
  '/me/characters': 'characters',
  '/me/history': 'history',
  '/me/summaries': 'summaries',
  '/me/notes': 'notes',
};

const SECTION_ACTIONS: Partial<Record<Section, React.JSX.Element>> = {
  characters: <Link className="btn btn--primary btn--sm" to="/characters?new=1">Create a character</Link>,
  history: <Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link>,
  summaries: <Link className="btn btn--primary btn--sm" to="/summaries/new">Write a summary</Link>,
};

function MeSections({ section, notes }: { section: Section; notes: ReturnType<typeof usePrivateNotes> }): React.JSX.Element {
  const meQ = useMe();
  const [edit] = useUrlParam('edit');
  const activity = useProfileActivity(meQ.data?.id ?? '', { loadHistory: section === 'history' });
  const count = (state: MeShellState): string | undefined => {
    if (section === 'characters') return state.data.roster.status === 'ready' ? pluralize(state.data.roster.data.length, 'character') : undefined;
    if (section === 'history') return activity.history.data ? pluralize(activity.history.data.length, 'quest') : undefined;
    if (section === 'summaries') return activity.activity.data ? pluralize(activity.activity.data.writings.length, 'summary', 'summaries') : undefined;
    return undefined;
  };
  return <MeShell count={count} actions={SECTION_ACTIONS[section]}>{(state) => <>
    {section === 'characters' ? <RosterPage {...state} />
      : section === 'history' ? <HistoryPage activity={activity} />
        : section === 'summaries' ? <SummariesPage activity={activity} />
          : section === 'notes' ? null
            : <>{edit === 'availability' ? <MeAvailabilityEditor me={state.me} /> : null}<OverviewPage {...state} notes={notes} /></>}
    <div hidden={section !== 'notes'}><PrivateNotesPanel notes={notes} /></div>
  </>}</MeShell>;
}

export function MePage(): React.JSX.Element {
  const [params] = useSearchParams();
  const location = useLocation();
  const notes = usePrivateNotes();
  const legacyTab = params.get('tab');
  if (location.pathname === '/me' && legacyTab !== null) return <Navigate replace to={LEGACY_ME_TABS[legacyTab] ?? '/me'} />;
  return <MeSections section={SECTION_BY_PATH[location.pathname] ?? 'overview'} notes={notes} />;
}

export const MeCharactersPage = MePage;
export const MeNotesPage = MePage;
