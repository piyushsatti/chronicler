import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { SeriesCreateAction } from '../../../components/domain/SeriesCreateAction.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { ProfileActivity } from '../components/ProfileActivity.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { canCreateRecord } from '../../../auth/createRules.js';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import { useLiveDm } from '../../../hooks/useLiveDm.js';
import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { clockLabel, isSentinelDate, personLabels, pluralize, roleLabel, statusLabel, weekdayLabel } from '../../../utils/format.js';
import type { DmTableSessionView } from '../types.js';
import { ProfileOwnerActions } from '../components/ProfileOwnerActions.js';
import { useDmTableDetailPage } from '../hooks/useDmTableDetailPage.js';
import { useProfileBody } from '../hooks/useProfileBody.js';
import { useProfileDmDetails } from '../hooks/useProfileDmDetails.js';
import styles from './profile.module.css';

function Sessions({ items, emptyMessage = 'No sessions are scheduled yet.', action }: { items: DmTableSessionView[]; emptyMessage?: string; action?: React.ReactNode }) {
  const { formatDateTime } = useDateFormatter();
  return items.length ? (
    <ul className={styles.sessions}>
      {items.map((session) => (
        <li key={session.id} className={styles.session}>
          <div className={styles.sessionBody}>
            <Link
              className={`type-title ${styles.titleLink}`}
              to={`/quests/${session.shortCode}`}
            >
              {session.title}
            </Link>
            {isSentinelDate(session.scheduledAt) ? null : (
              <p className="type-caption">{formatDateTime(session.scheduledAt)}</p>
            )}
          </div>
          <div className={styles.chips}>
            <Chip size="sm" tone="status">
              {statusLabel(session.status)}
            </Chip>
            <Chip size="sm" tone="line">
              {session.filledCount} of {pluralize(session.slotsMax, 'seat')} filled
            </Chip>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <EmptyState
      message={emptyMessage}
      action={action ??
        <Link className="btn btn--secondary btn--sm" to="/quests">
          Browse the quest board
        </Link>
      }
    />
  );
}
function isPastQuest(quest: DmTableSessionView) {
  return ['played', 'closed', 'completed', 'cancelled'].includes(quest.rawStatus) || Date.parse(quest.scheduledAt) < Date.now();
}
function DmInformation({
  state,
  canCreate,
  canCreateQuest,
}: {
  state: ReturnType<typeof useProfileDmDetails>;
  canCreate: boolean;
  canCreateQuest: boolean;
}) {
  const details = state.details.data;
  const schedule = state.schedule.data;
  if (
    state.details.isSuccess && state.schedule.isSuccess && details && schedule &&
    details.documents.total === 0 && details.questArcs.total === 0 && schedule.total === 0
  ) {
    return canCreate ? (
      <Card className="stack" pad={4}>
        <h2 className="type-heading">Tables, series and quests</h2>
        <p className="type-caption">Nothing here yet.</p>
        {canCreate ? <div className={styles.chips}>
          <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">New DM table</Link>
          <SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} />
          {canCreateQuest ? <Link className="btn btn--secondary btn--sm" to="/quests/new">Post a quest</Link> : null}
        </div> : null}
      </Card>
    ) : <p className="type-caption">Nothing here yet.</p>;
  }
  return (
    <div className="stack" data-gap="4">
      <Card className="stack" pad={4}>
        <div className={styles.cardHead}>
          <h2 className="type-heading">DM tables</h2>
          {canCreate && state.details.data?.documents.items.length ? (
            <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
              New DM table
            </Link>
          ) : null}
        </div>
        {state.details.isError ? (
          <StatePanel variant="inline" status="error" error={toAppError(state.details.error, 'profile:tables')} />
        ) : state.details.isPending ? (
          <StatePanel variant="inline" status="loading" />
        ) : state.details.data ? (
          <>
            {state.details.data.documents.items.length ? (
              <CardGrid>
                {state.details.data.documents.items.map((table) => (
                  <Card key={table.id} className="stack" pad={4}>
                    <Link
                      className={`type-title ${styles.titleLink}`}
                      to={`/community/dm-table/${table.slug}`}
                    >
                      {table.title}
                    </Link>
                    <Chip size="sm" tone="status">
                      {statusLabel(table.status)}
                    </Chip>
                    {table.canEditBody || table.canEditMetadata ? (
                      <Link
                        className="type-link"
                        to={`/editor/dm-table/${table.id}/edit`}
                      >
                        Edit {table.title}
                      </Link>
                    ) : null}
                  </Card>
                ))}
              </CardGrid>
            ) : (
              <EmptyState
                message={
                  canCreate
                    ? 'You have not published a DM table yet.'
                    : 'No DM tables to show yet.'
                }
                action={
                  canCreate ? (
                    <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
                      New DM table
                    </Link>
                  ) : <Link className="type-link" to="/dms">Browse DMs</Link>
                }
              />
            )}
            {state.details.data.documents.total > state.pageSize ? (
              <nav className="row" data-wrap="1" aria-label="DM table pages">
                <Button
                  variant="ghost"
                  disabled={state.page === 1 || state.details.isFetching}
                  onClick={() => state.setPage(state.page - 1)}
                >
                  Previous tables
                </Button>
                <span className="type-caption">
                  Page {state.page} ·{' '}
                  {pluralize(state.details.data.documents.total, 'table')}
                </span>
                <Button
                  variant="ghost"
                  disabled={
                    state.page * state.pageSize >= state.details.data.documents.total ||
                    state.details.isFetching
                  }
                  onClick={() => state.setPage(state.page + 1)}
                >
                  Next tables
                </Button>
              </nav>
            ) : null}
          </>
        ) : null}
      </Card>
      <Card className="stack" pad={4}>
        <div className={styles.cardHead}>
          <h2 className="type-heading">Series</h2>
          {canCreate ? <SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} /> : null}
        </div>
        {state.details.isError ? <StatePanel variant="inline" status="error" error={toAppError(state.details.error, 'profile:series')} /> :
          state.details.isPending ? <StatePanel variant="inline" status="loading" /> :
          state.details.data?.questArcs.items.length ? <CardGrid>{state.details.data.questArcs.items.map((arc) => <Card key={arc.id} variant="clickable" to={`/series/${arc.id}`} pad={4}><h3 className="type-title">{arc.name}</h3><p className="type-caption">{pluralize(arc.questCount, 'quest')}</p></Card>)}</CardGrid> :
          <EmptyState message="No quest series have been shared yet." action={canCreate ? <SeriesCreateAction label="Create a series" variant="ghost" size="sm" showAuthorityError={false} /> : <Link className="type-link" to="/quests">Browse quests</Link>} />}
      </Card>
      <Card className="stack" pad={4}>
        <h2 className="type-heading">Quests</h2>
        {state.schedule.isError ? (
          <StatePanel variant="inline" status="error" error={toAppError(state.schedule.error, 'profile:sessions')} />
        ) : state.schedule.isPending ? (
          <StatePanel variant="inline" status="loading" />
        ) : state.schedule.data ? (
          <>
            {state.schedule.data.items.length ? <>
              <section className="stack" aria-label="Upcoming quests">
                <h3 className="type-title">Upcoming quests</h3>
                <Sessions items={state.schedule.data.items.filter((quest) => !isPastQuest(quest))} emptyMessage="No upcoming quests on this page." action={<Link className="type-link" to={canCreateQuest ? '/quests/new' : '/quests'}>{canCreateQuest ? 'Post a quest' : 'Browse quests'}</Link>} />
              </section>
              <section className="stack" aria-label="Past quests">
                <h3 className="type-title">Past quests</h3>
                <Sessions items={state.schedule.data.items.filter(isPastQuest)} emptyMessage="No past quests on this page." />
              </section>
            </> : <Sessions items={[]} action={canCreateQuest ? <Link className="type-link" to="/quests/new">Post a quest</Link> : undefined} />}

            {state.schedule.data.total > state.schedulePageSize ? (
              <nav className="row" data-wrap="1" aria-label="DM session pages">
                <Button
                  variant="ghost"
                  disabled={state.schedulePage === 1 || state.schedule.isFetching}
                  onClick={() => state.setSchedulePage(state.schedulePage - 1)}
                >
                  Previous sessions
                </Button>
                <span className="type-caption">
                  Page {state.schedulePage} ·{' '}
                  {pluralize(state.schedule.data.total, 'session')}
                </span>
                <Button
                  variant="ghost"
                  disabled={
                    state.schedulePage * state.schedulePageSize >=
                      state.schedule.data.total || state.schedule.isFetching
                  }
                  onClick={() => state.setSchedulePage(state.schedulePage + 1)}
                >
                  Next sessions
                </Button>
              </nav>
            ) : null}
          </>
        ) : null}
      </Card>
    </div>
  );
}
function ProfileBody({
  role,
  shortCode,
}: {
  role: 'dm' | 'player';
  shortCode: string;
}) {
  const page = useProfileBody(shortCode);
  const me = useMe();
  const back = {
    to: role === 'dm' ? '/dms' : '/players',
    label: role === 'dm' ? 'DMs' : 'Players',
  };
  if (page.status === 'error' || page.status === 'loading' || page.status === 'empty') {
    return (
      <div className={styles.body}>
        <PageHeader
          back={back}
          title={role === 'dm' ? 'DM profile' : 'Player profile'}
        />
        {page.status === 'error' ? (
          <StatePanel status="error" error={page.error} />
        ) : page.status === 'loading' ? (
          <StatePanel status="loading" />
        ) : (
          <StatePanel
            status="empty"
            title="Profile not found"
            emptyMessage="This member doesn't exist, or their profile isn't shared with you."
            action={
              <Link className="btn" to={back.to}>
                Back to {back.label}
              </Link>
            }
          />
        )}
      </div>
    );
  }
  return <ProfileView key={page.profile.member.id} role={role} page={page} me={me} />;
}
function ProfileView({
  role,
  page,
  me,
}: {
  role: 'dm' | 'player';
  page: Extract<ReturnType<typeof useProfileBody>, { status: 'ready' }>;
  me: ReturnType<typeof useMe>;
}) {
  const [edit, setEdit] = useUrlParam('edit');
  const editing = edit === 'profile' || edit === 'availability';
  const profile = page.profile;
  const showDmInformation = role === 'dm' || profile.member.roles.includes('dm');
  const dmDetails = useProfileDmDetails(profile.member.id, showDmInformation);
  const owner = me.data?.id === profile.member.id;
  const roles = me.data?.roles ?? [];
  const canDm = roles.includes('dm') || roles.includes('admin');
  const liveDm = useLiveDm(owner && canDm);
  const canCreateQuest = owner && canCreateRecord('quest', {
    roles,
    liveDm: liveDm.status === 'ready' && liveDm.liveDm,
  });
  const availabilityStat = profile.availability.length
    ? [...new Set(profile.availability.map((slot) => weekdayLabel(slot.day, { plural: true })))].join(', ')
    : 'Not shared';
  const sessionsRun = role !== 'dm' ? undefined : dmDetails.details.data
    ? dmDetails.details.data.dmStats?.sessionCount ?? 0
    : dmDetails.details.isError ? 'Unavailable' : 'Loading';
  const activity = profile.activitySummary;
  const hasActivity =
    activity.messages + activity.reactions + activity.voiceMinutes > 0;
  const name = personLabels([profile.member])[0];
  const editor = owner && editing ? (
    <Card className={styles.owner} pad={4}>
      <ProfileOwnerActions
        key={profile.member.id}
        profile={profile}
        canAvailability={roles.includes('player') || roles.includes('admin')}
        canDm={canDm}
        focusAvailability={edit === 'availability'}
      />
    </Card>
  ) : null;
  const about = (
    <div className="stack" data-gap="4">
      {profile.dmProfile || hasActivity ? <Card className="stack" pad={4}>
        <h2 className="type-heading">About</h2>
        {profile.dmProfile?.tagline ? (
          <p className="type-body">{profile.dmProfile.tagline}</p>
        ) : owner && canDm ? (
          <EmptyState message="You have not written a bio yet." action={<Button variant="secondary" size="sm" onClick={() => setEdit('profile')}>Edit profile</Button>} />
        ) : !profile.dmProfile?.philosophy &&
          !profile.dmProfile?.houseRules &&
          !hasActivity ? (
          <EmptyState message={`${name} hasn’t written a bio yet.`} />
        ) : null}
        {profile.dmProfile ? <>
          {profile.dmProfile.philosophy ? <p className="type-narrative">{profile.dmProfile.philosophy}</p> : null}
          {profile.dmProfile.houseRules ? <>
            <h3 className="type-title">House rules</h3>
            <p className="type-narrative">{profile.dmProfile.houseRules}</p>
          </> : null}
        </> : null}
        {hasActivity ? <p className="type-caption">
          {pluralize(activity.messages, 'message')}, {pluralize(activity.reactions, 'reaction')} and {pluralize(activity.voiceMinutes, 'voice minute')} on Discord
        </p> : null}
      </Card> : <EmptyState message="No Discord activity has been recorded yet." action={owner ? <Link className="type-link" to="/quests">Find a quest</Link> : undefined} />}
      {showDmInformation ? <DmInformation key={profile.member.id} state={dmDetails} canCreate={owner && canDm} canCreateQuest={canCreateQuest} /> : null}
    </div>
  );
  return (
    <div className={styles.body} data-el="profile.body">
      <ProfileActivity
        key={profile.member.id}
        memberId={profile.member.id}
        owner={owner}
        sessionsRun={sessionsRun}
        availability={availabilityStat}
        editor={editor}
        toolbarActions={<PageToolbar.IconAction label={`Back to ${role === 'dm' ? 'DMs' : 'Players'}`} href={role === 'dm' ? '/dms' : '/players'}>←</PageToolbar.IconAction>}
        about={about}
        renderHero={(stats) => (
          <Card className={styles.hero} pad={4}>
            <PageHeader
              title={<span className={styles.titleRow}><span aria-hidden="true"><Avatar name={name} src={profile.member.avatarUrl ?? undefined} size="lg" online={false} /></span>{name}</span>}
              actions={owner ? <Button variant="secondary" aria-expanded={editing} onClick={() => setEdit(editing ? '' : 'profile')}>{editing ? 'Close editor' : 'Edit profile'}</Button> : null}
              meta={<>
                {profile.member.roles.filter((value) => value === 'dm' || value === 'player' || value === 'admin').map((value) => <Chip key={value} size="sm" tone="line">{roleLabel(value)}</Chip>)}
                {profile.dmProfile && page.member.isDm ? <Chip size="sm" tone={profile.dmProfile.acceptingPlayers ? 'accent' : 'line'}>{profile.dmProfile.acceptingPlayers ? 'Accepting players' : 'Not accepting players'}</Chip> : null}
                {profile.availability.map((slot, index) => <Chip key={`${slot.day}-${slot.startTime}-${index}`} size="sm" tone="neutral">{weekdayLabel(slot.day, { plural: true })} {clockLabel(slot.startTime)}–{clockLabel(slot.endTime)}</Chip>)}
              </>}
            />
            <div className={styles.heroStats} aria-label="Profile statistics">{stats.map((stat) => <StatTile key={stat.label} size="sm" label={stat.label} value={stat.value} />)}</div>
          </Card>
        )}
      />
    </div>
  );
}
export function PlayerProfilePage() {
  const { shortCode = '' } = useParams();
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="player-profile">
        <ProfileBody role="player" shortCode={shortCode} />
      </SingleRegionPage>
    </PageShell>
  );
}
export function DMProfilePage() {
  const { shortCode = '' } = useParams();
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="dm-profile">
        <ProfileBody role="dm" shortCode={shortCode} />
      </SingleRegionPage>
    </PageShell>
  );
}
export function DmTableDetailPage() {
  const { slug = '' } = useParams();
  const state = useDmTableDetailPage(slug);
  const memberHref = useMemberHref();
  const doc = state.doc.data;
  const authorProfile = useMemberProfile(doc?.authorHandle ?? '');
  const author = doc?.authorHandle ? { ...authorProfile.data?.member, handle: doc.authorHandle } : null;
  const authorName = author ? personLabels([author])[0] : null;
  const back = { to: '/community?tab=members&role=dm', label: 'Community' };
  const backAction = (
    <Link className="btn" to="/community?tab=members&role=dm">
      Back to Community
    </Link>
  );
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="dm-table-detail">
        {state.doc.isError || state.doc.isPending || !doc ? (
          <div className="stack" data-gap="5">
            <PageHeader back={back} title="DM table" />
            {state.doc.isError ? (
              <StatePanel
                status="error"
                title="DM table unavailable"
                error={toAppError(state.doc.error, 'dm-table:detail')}
                action={backAction}
              />
            ) : state.doc.isPending ? (
              <StatePanel status="loading" />
            ) : (
              <StatePanel
                status="empty"
                title="DM table not found"
                emptyMessage="This DM table doesn't exist, or it isn't shared with you."
                action={backAction}
              />
            )}
          </div>
        ) : (
          <div className="stack" data-gap="5">
            <PageHeader
              back={back}
              title={doc.title}
              lede={doc.blurb}
              actions={
                doc.canEdit ? (
                  <Link className="btn" to={`/editor/dm-table/${doc.id}/edit`}>
                    Edit table
                  </Link>
                ) : null
              }
              meta={
                <>
                  {doc.status === 'draft' ? <Chip size="sm">Draft</Chip> : null}
                  {doc.tags.map((tag) => (
                    <Chip key={tag} size="sm" tone="line">
                      {tag}
                    </Chip>
                  ))}
                </>
              }
            />
            <DetailLayout
              railLabel="About this table"
              rail={
                <div className="stack" data-gap="4">
                {author && authorName ? <Card as="section" className="stack" pad={4} data-gap="3" aria-label="Hosted by">
                  <h2 className="type-title">Hosted by</h2>
                  <div className={styles.titleRow}>
                    <Avatar name={authorName} src={author.avatarUrl ?? undefined} size="md" />
                    <Link className="type-title" to={memberHref({ memberId: doc.authorId, handle: author.handle }, 'dm')}>{authorName}</Link>
                  </div>
                </Card> : null}
                <Card className="stack" pad={4}>
                  <h2 className="type-heading">Sessions</h2>
                  {state.schedule.isError ? (
                    <StatePanel
                      status="error"
                      error={toAppError(state.schedule.error, 'dm-table:schedule')}
                    />
                  ) : state.schedule.isPending ? (
                    <StatePanel status="loading" />
                  ) : state.schedule.data ? (
                    <>
                      <Sessions items={state.schedule.data.items} />
                      {state.schedule.data.total > state.pageSize ? (
                        <nav
                          className="row"
                          data-wrap="1"
                          aria-label="Table session pages"
                        >
                          <Button
                            variant="ghost"
                            disabled={state.page === 1 || state.schedule.isFetching}
                            onClick={() => state.setPage(state.page - 1)}
                          >
                            Previous sessions
                          </Button>
                          <span className="type-caption">
                            Page {state.page} ·{' '}
                            {pluralize(state.schedule.data.total, 'session')}
                          </span>
                          <Button
                            variant="ghost"
                            disabled={
                              state.page * state.pageSize >=
                                state.schedule.data.total || state.schedule.isFetching
                            }
                            onClick={() => state.setPage(state.page + 1)}
                          >
                            Next sessions
                          </Button>
                        </nav>
                      ) : null}
                    </>
                  ) : <EmptyState message="No sessions are scheduled yet." action={<Link className="type-link" to="/quests">Browse the quest board</Link>} />}
                </Card>
                </div>
              }
            >
              <DetailLayout.Reading>
                <Card as="article" pad={6}>{doc.body ? (
                  <div className="summary-prose"><ContentRenderer body={doc.body} /></div>
                ) : (
                  <EmptyState message="This table has no write-up yet." action={doc.canEdit ? <Link className="btn btn--secondary btn--sm" to={`/editor/dm-table/${doc.id}/edit`}>Write about this table</Link> : <Link className="type-link" to="/community?tab=members&role=dm">Find another table</Link>} />
                )}</Card>
              </DetailLayout.Reading>
            </DetailLayout>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
