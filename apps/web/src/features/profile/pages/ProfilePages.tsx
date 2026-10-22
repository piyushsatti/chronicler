import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { DmTablePanel } from '../../../components/domain/DmTablePanel.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Button } from '../../../components/primitives/Button.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import {
  clockLabel,
  pluralize,
  statusLabel,
  weekdayLabel,
} from '../../../utils/format.js';
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
            <Link className={`type-title ${styles.titleLink}`} to={`/quests/${session.shortCode}`}>
              {session.title}
            </Link>
            <p className="type-caption">{formatDateTime(session.scheduledAt)}</p>
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
    <StatePanel variant="inline" status="empty" emptyMessage="No sessions recorded." />
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
    <div className={styles.cards}>
      <Card className="stack" pad={4}>
        <div className={styles.cardHead}>
          <h2 className="type-heading">DM tables</h2>
          {state.details.data?.dmStats ? (
            <Chip size="sm" tone="line">
              {pluralize(state.details.data.dmStats.sessionCount, 'session')} run
            </Chip>
          ) : null}
          {canCreate ? (
            <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
              Create table
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
              <StatePanel
                variant="inline"
                status="empty"
                emptyMessage="No DM tables to show yet."
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
  if (page.status === 'error') return <StatePanel status="error" error={page.error} />;
  if (page.status === 'loading') return <StatePanel status="loading" />;
  if (page.status === 'empty')
    return (
      <div className="stack" data-gap="3">
        <StatePanel status="empty" emptyMessage="Profile not found." />
        <Link
          className="btn btn--secondary"
          to={role === 'dm' ? '/dms' : '/players'}
        >
          Back to directory
        </Link>
      </div>
    );
  const profile = page.profile;
  const owner = me.data?.id === profile.member.id;
  const roles = me.data?.roles ?? [];
  const canDm = roles.includes('dm') || roles.includes('admin');
  const activity = profile.activitySummary;
  const hasActivity = activity.messages + activity.reactions + activity.voiceMinutes > 0;
  return (
    <div className={styles.body} data-el="profile.body">
      <Link
        className={`btn btn--ghost btn--sm ${styles.backLink}`}
        to={role === 'dm' ? '/dms' : '/players'}
      >
        Back to directory
      </Link>
      <header className={styles.hero}>
        <Avatar
          name={profile.member.displayName}
          src={profile.member.avatarUrl ?? undefined}
          size="lg"
        />
        <div className={styles.heroBody}>
          <p className="type-label">{role === 'dm' ? 'Dungeon Master' : 'Player'}</p>
          <h1 className="type-display">{profile.member.displayName}</h1>
          <div className={styles.chips}>
            <span className="type-caption">@{profile.member.handle}</span>
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
          </div>
        </div>
      </header>
      <div className={styles.cards}>
        <Card className="stack" pad={4}>
          <h2 className="type-heading">About</h2>
          {profile.dmProfile?.tagline ? (
            <p className="type-body">{profile.dmProfile.tagline}</p>
          ) : (
            <p className="type-caption">No tagline yet.</p>
          )}
          {profile.dmProfile ? (
            <>
              {profile.dmProfile.philosophy ? (
                <p className="type-narrative">{profile.dmProfile.philosophy}</p>
              ) : null}
              {profile.dmProfile.houseRules ? (
                <>
                  <h3 className="type-label">House rules</h3>
                  <p className="type-narrative">{profile.dmProfile.houseRules}</p>
                </>
              ) : null}
              {owner ? (
                <p className="type-caption">
                  DM review: {statusLabel(profile.dmProfile.status)} · Revision{' '}
                  {profile.dmProfile.reviewRevision}
                </p>
              ) : null}
            </>
          ) : null}
          {hasActivity ? (
            <p className="type-caption">
              {pluralize(activity.messages, 'message')} ·{' '}
              {pluralize(activity.reactions, 'reaction')} ·{' '}
              {pluralize(activity.voiceMinutes, 'voice minute')}
            </p>
          ) : null}
        </Card>
        <Card className="stack" pad={4}>
          <h2 className="type-heading">Availability</h2>
          {profile.availability.length ? (
            <ul className={styles.slots}>
              {profile.availability.map((slot, index) => (
                <li key={index}>
                  <Chip size="md" tone="neutral">
                    {weekdayLabel(slot.day, { plural: true })} {clockLabel(slot.startTime)}–
                    {clockLabel(slot.endTime)}
                  </Chip>
                  {slot.note ? <span className="type-caption">{slot.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-caption">No availability set.</p>
          )}
        </Card>
      </div>
      {owner ? (
        <Card className={styles.owner} pad={4}>
          <ProfileOwnerActions
            key={profile.member.id}
            profile={profile}
            canAvailability={roles.includes('player') || roles.includes('admin')}
            canDm={canDm}
          />
        </Card>
      ) : null}
      {role === 'dm' || profile.member.roles.includes('dm') ? (
        <DmInformation
          key={profile.member.id}
          memberId={profile.member.id}
          canCreate={owner && canDm}
        />
      ) : null}
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
  const doc = state.doc.data;
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="dm-table-detail">
        {state.doc.isError ? (
          <StatePanel
            status="error"
            error={toAppError(state.doc.error, 'dm-table:detail')}
          />
        ) : state.doc.isPending ? (
          <StatePanel status="loading" />
        ) : !doc ? (
          <div className="stack" data-gap="3">
            <StatePanel
              status="empty"
              emptyMessage="This DM table doesn't exist, or it isn't shared with you."
            />
          </div>
        ) : (
          <div className="stack">
            <h1 className="type-display">{doc.title}</h1>
            <DmTablePanel
              table={{
                title: doc.title,
                blurb: doc.blurb,
                tags: doc.tags,
                body: doc.body,
                status: doc.status,
                slug: doc.slug,
              }}
            >
              {doc.authorHandle ? (
                <Link className="type-link" to={`/dms/@${doc.authorHandle}`}>
                  Hosted by @{doc.authorHandle}
                </Link>
              ) : null}
              {doc.canEdit ? (
                <Link className="btn" to={`/editor/dm-table/${doc.id}/edit`}>
                  Edit table
                </Link>
              ) : null}
            </DmTablePanel>
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
                    <nav className="row" data-wrap="1" aria-label="Table session pages">
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
                          state.page * state.pageSize >= state.schedule.data.total ||
                          state.schedule.isFetching
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
          </div>
        )}
        <Link className={`btn btn--secondary ${styles.back}`} to="/community">
          Back to community
        </Link>
      </SingleRegionPage>
    </PageShell>
  );
}
