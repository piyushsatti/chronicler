import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { clockLabel, handleLabel, handleOnlyName, isSentinelDate, personName, pluralize, roleLabel, statusLabel, weekdayLabel } from '../../../utils/format.js';
import type { DmTableSessionView } from '../types.js';
import { ProfileOwnerActions } from '../components/ProfileOwnerActions.js';
import { useDmTableDetailPage } from '../hooks/useDmTableDetailPage.js';
import { useProfileBody } from '../hooks/useProfileBody.js';
import { useProfileDmDetails } from '../hooks/useProfileDmDetails.js';
import styles from './profile.module.css';

function Sessions({ items }: { items: DmTableSessionView[] }) {
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
      message="No sessions are scheduled yet."
      action={
        <Link className="btn btn--secondary btn--sm" to="/quests">
          Browse the quest board
        </Link>
      }
    />
  );
}
function DmInformation({
  memberId,
  canCreate,
}: {
  memberId: string;
  canCreate: boolean;
}) {
  const state = useProfileDmDetails(memberId);
  return (
    <div className="stack" data-gap="5">
      <Card className="stack" pad={4}>
        <div className={styles.cardHead}>
          <h2 className="type-heading">DM tables</h2>
          {state.details.data?.dmStats ? (
            <Chip size="sm" tone="line">
              {pluralize(state.details.data.dmStats.sessionCount, 'session')} run
            </Chip>
          ) : null}
          {canCreate && state.details.data?.documents.items.length ? (
            <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
              New DM table
            </Link>
          ) : null}
        </div>
        {state.details.isError ? (
          <StatePanel
            status="error"
            error={toAppError(state.details.error, 'profile:tables')}
          />
        ) : state.details.isPending ? (
          <StatePanel status="loading" />
        ) : state.details.data ? (
          <>
            {state.details.data.documents.items.length ? (
              <ul className={styles.sessions}>
                {state.details.data.documents.items.map((table) => (
                  <li key={table.id} className={styles.session}>
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
                  </li>
                ))}
              </ul>
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
                  ) : undefined
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
        <h2 className="type-heading">Sessions</h2>
        {state.schedule.isError ? (
          <StatePanel
            status="error"
            error={toAppError(state.schedule.error, 'profile:sessions')}
          />
        ) : state.schedule.isPending ? (
          <StatePanel status="loading" />
        ) : state.schedule.data ? (
          <>
            <Sessions items={state.schedule.data.items} />
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
  return <ProfileView role={role} page={page} me={me} />;
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
  const [editing, setEditing] = useState(false);
  const profile = page.profile;
  const owner = me.data?.id === profile.member.id;
  const roles = me.data?.roles ?? [];
  const canDm = roles.includes('dm') || roles.includes('admin');
  const activity = profile.activitySummary;
  const hasActivity =
    activity.messages + activity.reactions + activity.voiceMinutes > 0;
  const name = personName(profile.member);
  const handle = handleLabel(profile.member.handle);
  return (
    <div className={styles.body} data-el="profile.body">
      <PageHeader
        back={{
          to: role === 'dm' ? '/dms' : '/players',
          label: role === 'dm' ? 'DMs' : 'Players',
        }}
        title={
          <span className={styles.titleRow}>
            <span aria-hidden="true">
              <Avatar
                name={name}
                src={profile.member.avatarUrl ?? undefined}
                size="lg"
                online={false}
              />
            </span>
            {name}
          </span>
        }
        actions={
          owner ? (
            <Button
              variant="secondary"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? 'Close editor' : 'Edit profile'}
            </Button>
          ) : null
        }
        meta={
          <>
            {handle ? <span>{handle}</span> : null}
            {profile.member.roles
              .filter(
                (value) => value === 'dm' || value === 'player' || value === 'admin',
              )
              .map((value) => (
                <Chip key={value} size="sm" tone="line">
                  {roleLabel(value)}
                </Chip>
              ))}
            {owner && profile.dmProfile ? (
              <Chip size="sm" tone="status">
                {statusLabel(profile.dmProfile.status)}
              </Chip>
            ) : null}
            {profile.dmProfile && page.member.isDm ? (
              <Chip
                size="sm"
                tone={profile.dmProfile.acceptingPlayers ? 'accent' : 'line'}
              >
                {profile.dmProfile.acceptingPlayers
                  ? 'Accepting players'
                  : 'Not accepting players'}
              </Chip>
            ) : null}
          </>
        }
      />
      {owner && editing ? (
        <Card className={styles.owner} pad={4}>
          <ProfileOwnerActions
            key={profile.member.id}
            profile={profile}
            canAvailability={roles.includes('player') || roles.includes('admin')}
            canDm={canDm}
          />
        </Card>
      ) : null}
      <DetailLayout
        railLabel="Availability"
        rail={
          <Card className="stack" pad={4}>
            <h2 className="type-heading">Availability</h2>
            {profile.availability.length ? (
              <ul className={styles.slots}>
                {profile.availability.map((slot, index) => (
                  <li key={index}>
                    <Chip size="md" tone="neutral">
                      {weekdayLabel(slot.day, { plural: true })}{' '}
                      {clockLabel(slot.startTime)}–{clockLabel(slot.endTime)}
                    </Chip>
                    {slot.note ? (
                      <span className="type-caption">{slot.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                message={
                  owner
                    ? 'Add your availability from Edit profile.'
                    : `${name} hasn't set their availability.`
                }
              />
            )}
          </Card>
        }
      >
        <div className="stack" data-gap="5">
          <Card className="stack" pad={4}>
            <h2 className="type-heading">About</h2>
            {profile.dmProfile?.tagline ? (
              <p className="type-body">{profile.dmProfile.tagline}</p>
            ) : owner ? (
              <EmptyState message="No tagline yet. Add one from Edit profile." />
            ) : !profile.dmProfile?.philosophy &&
              !profile.dmProfile?.houseRules &&
              !hasActivity ? (
              <EmptyState message={`${name} hasn’t written a bio yet.`} />
            ) : null}
            {profile.dmProfile ? (
              <>
                {profile.dmProfile.philosophy ? (
                  <p className="type-narrative">{profile.dmProfile.philosophy}</p>
                ) : null}
                {profile.dmProfile.houseRules ? (
                  <>
                    <h3 className="type-title">House rules</h3>
                    <p className="type-narrative">{profile.dmProfile.houseRules}</p>
                  </>
                ) : null}
              </>
            ) : null}
            {hasActivity ? (
              <p className="type-caption">
                {pluralize(activity.messages, 'message')},{' '}
                {pluralize(activity.reactions, 'reaction')} and{' '}
                {pluralize(activity.voiceMinutes, 'voice minute')} on Discord
              </p>
            ) : null}
          </Card>
          {role === 'dm' || profile.member.roles.includes('dm') ? (
            <DmInformation
              key={profile.member.id}
              memberId={profile.member.id}
              canCreate={owner && canDm}
            />
          ) : null}
        </div>
      </DetailLayout>
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
  const back = { to: '/community?tab=dms', label: 'Community' };
  const backAction = (
    <Link className="btn" to="/community?tab=dms">
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
                  {doc.authorHandle ? (
                    <Link
                      className="type-link"
                      to={memberHref({ handle: doc.authorHandle }, 'dm')}
                    >
                      Hosted by {handleOnlyName(doc.authorHandle)}
                    </Link>
                  ) : null}
                </>
              }
            />
            <DetailLayout
              railLabel="Sessions"
              rail={
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
                  ) : null}
                </Card>
              }
            >
              <DetailLayout.Reading>
                {doc.body ? (
                  <ContentRenderer body={doc.body} />
                ) : (
                  <p className="type-caption">This table has no write-up yet.</p>
                )}
              </DetailLayout.Reading>
            </DetailLayout>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
