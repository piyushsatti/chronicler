import { Link } from 'react-router-dom';
import { DmApprovalNotice } from '../../../components/domain/DmApprovalNotice.js';
import { SeriesCreateAction } from '../../../components/domain/SeriesCreateAction.js';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Table, type Column } from '../../../components/primitives/Table.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { AdminPagination } from './AdminPagination.js';
import type { useDmDashboard } from '../../../hooks/useDmDashboard.js';
import './DmDashboard.css';

export function DmDashboard({ view }: { view: ReturnType<typeof useDmDashboard> }) {
  const { formatDateTime } = useDateFormatter();
  const { query } = view;
  if (query.isError)
    return (
      <div className="stack">
        <PageHeader back={{ to: '/me', label: 'Your page' }} title="DM dashboard" />
        <StatePanel status="error" error={query.error} />
        <Button onClick={view.retry}>Retry dashboard</Button>
      </div>
    );
  if (query.isLoading || !query.data) return (
    <div className="stack">
      <PageHeader back={{ to: '/me', label: 'Your page' }} title="DM dashboard" />
      <StatePanel status="loading" />
    </div>
  );
  const data = query.data;
  const past = (quest: (typeof data.quests.items)[number]) =>
    ['played', 'closed', 'cancelled'].includes(quest.status) ||
    (quest.scheduledAt !== null && Date.parse(quest.scheduledAt) < Date.now());
  const upcoming = data.quests.items.filter((quest) => !past(quest));
  const history = data.quests.items.filter(past);
  const columns: Column<(typeof data.quests.items)[number]>[] = [
    {
      key: 'title',
      label: 'Quest',
      render: (quest) => (
        <Link className="type-title" to={`/quests/${quest.shortCode}`}>
          {quest.briefDocument?.title ?? 'Untitled quest'}
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (quest) => (
        <Chip tone="line" size="sm">
          {statusLabel(quest.status)}
        </Chip>
      ),
    },
    {
      key: 'seats',
      label: 'Seats',
      align: 'end',
      render: (quest) => `${quest.filledCount}/${quest.slotsMax}`,
    },
    {
      key: 'scheduledAt',
      label: 'Scheduled',
      render: (quest) =>
        quest.scheduledAt && !isSentinelDate(quest.scheduledAt) ? (
          <time dateTime={quest.scheduledAt}>{formatDateTime(quest.scheduledAt)}</time>
        ) : (
          'Unscheduled'
        ),
    },
    {
      key: 'manage',
      label: 'Manage',
      render: (quest) => (
        <Link
          className="type-link"
          to={`/quests/${quest.shortCode}`}
          aria-label="Manage participation, attendance and summary"
        >
          Manage
        </Link>
      ),
    },
  ];
  return (
    <div className="dm-dashboard stack">
      <PageHeader
        back={{ to: '/me', label: 'Your page' }}
        title="DM dashboard"
        lede="Plan your next session and manage your quests, series and DM tables."
        actions={
          <>
            <Link className="btn btn--secondary" to={view.profileHref}>
              Edit DM profile
            </Link>
            {view.canCreateQuest && data.quests.items.length > 0 ? (
              <Link className="btn btn--primary" to="/quests/new">
                Post a quest
              </Link>
            ) : null}
          </>
        }
      />
      <DmApprovalNotice />
      <CardGrid className="dm-dashboard__stats" gap={3} aria-label="Your DM stats">
        <StatTile label="Quests posted" value={data.quests.total} />
        {data.dmStats ? <StatTile label="Sessions run" value={data.dmStats.sessionCount} /> : null}
        <StatTile label="DM tables" value={data.documents.total} />
      </CardGrid>
      <DetailLayout
        railLabel="DM tools"
        rail={
          <Card className="stack" as="section">
            <h2 className="type-heading">DM tools</h2>
            <p className="type-caption">Open a quest to manage sign-ups, record attendance and link session summaries.</p>
            <Link className="type-link" to="/me">Your page and DM profile</Link>
            <Link className="type-link" to="/calendar">Quest calendar</Link>
            <Link className="type-link" to="/quests">Browse all quests</Link>
            {view.canCreateQuest ? <SeriesCreateAction label="Create a series" variant="ghost" size="sm" showAuthorityError={false} /> : null}
          </Card>
        }
      >
      <div className="stack" data-gap="5">
      <Card className="stack" as="section" aria-label="Your quests">
        <h2 className="type-heading">Your quests</h2>
        <AdminPagination page={view.questPage} />
        <section className="stack" aria-label="Upcoming quests">
          <h3 className="type-title">Upcoming quests</h3>
        {upcoming.length === 0 ? (
          <EmptyState
            kind="generic"
            message={data.quests.total > 25 ? 'There are no upcoming quests on this page.' : 'You have no upcoming quests yet.'}
            action={
              view.canCreateQuest ? (
                <Link className="btn btn--primary btn--sm" to="/quests/new">
                  Post a quest
                </Link>
              ) : <Link className="btn btn--secondary btn--sm" to="/quests">Browse quests</Link>
            }
          />
        ) : (
          <Table
            className="dm-dashboard__quests type-caption"
            columns={columns}
            rows={upcoming}
            rowKey={(quest) => quest.id}
          />
        )}
        </section>
        <section className="stack" aria-label="Past quests">
          <h3 className="type-title">Past quests</h3>
          {history.length === 0 ? (
            <EmptyState
              kind="timeline-empty"
              message={data.quests.total > 25 ? 'There are no past quests on this page.' : 'You have no past quests yet.'}
              action={<Link className="btn btn--secondary btn--sm" to="/quests">Browse quests</Link>}
            />
          ) : <Table className="dm-dashboard__quests type-caption" columns={columns} rows={history} rowKey={(quest) => quest.id} />}
        </section>
      </Card>
      <Card className="stack" as="section" aria-label="Your series">
        <div className="row" data-wrap="1" data-justify="between" data-align="center">
          <h2 className="type-heading">Your series</h2>
          {data.series.length > 0 ? (
            <SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} />
          ) : null}
        </div>
        {data.series.length === 0 ? (
          <EmptyState
            kind="generic"
            message="You have not created a quest series yet."
            action={view.canCreateQuest
              ? <SeriesCreateAction label="Create a series" size="sm" showAuthorityError={false} />
              : <Link className="btn btn--secondary btn--sm" to={view.profileHref}>View your DM profile</Link>}
          />
        ) : (
          <CardGrid as="ul" gap={3}>
            {data.series.map((series) => (
              <li className="card stack" key={series.id}>
                <Link className="type-title" to={`/series/${encodeURIComponent(series.id)}`}>{series.name}</Link>
                <p className="type-caption dm-dashboard__pin">{pluralize(series.questCount, 'quest')}</p>
              </li>
            ))}
          </CardGrid>
        )}
      </Card>
      <Card className="stack">
        <div className="row" data-wrap="1" data-justify="between" data-align="center">
          <h2 className="type-heading">Your DM tables</h2>
          {data.documents.items.length > 0 ? (
            <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
              New DM table
            </Link>
          ) : null}
        </div>
        <AdminPagination page={view.tablePage} />
        {data.documents.items.length === 0 ? (
          <EmptyState
            kind="generic"
            message="You have no DM tables yet."
            action={
              <Link className="btn btn--secondary btn--sm" to="/editor/dm-table">
                New DM table
              </Link>
            }
          />
        ) : (
          <CardGrid as="ul" gap={3}>
            {data.documents.items.map((table) => (
              <li key={table.id} className="card stack">
                <Link className="type-title" to={`/community/dm-table/${table.slug}`}>
                  {table.title}
                </Link>
                <p className="type-caption dm-dashboard__pin">{statusLabel(table.status)}</p>
                {table.canEditMetadata ? (
                  <Link className="type-link" to={`/editor/dm-table/${table.id}/edit`}>
                    Edit table
                  </Link>
                ) : null}
              </li>
            ))}
          </CardGrid>
        )}
      </Card>
      </div>
      </DetailLayout>
    </div>
  );
}
