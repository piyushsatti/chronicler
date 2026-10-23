import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Table, type Column } from '../../../components/primitives/Table.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { AdminPagination } from './AdminPagination.js';
import type { useDmDashboard } from '../hooks/useDmDashboard.js';
import './DmDashboard.css';

export function DmDashboard({ view }: { view: ReturnType<typeof useDmDashboard> }) {
  const { formatDateTime } = useDateFormatter();
  const { query } = view;
  if (query.isError)
    return (
      <div className="stack">
        <StatePanel status="error" error={query.error} />
        <Button onClick={view.retry}>Retry dashboard</Button>
      </div>
    );
  if (query.isLoading || !query.data) return <StatePanel status="loading" />;
  const data = query.data;
  const columns: Column<(typeof data.quests.items)[number]>[] = [
    {
      key: 'title',
      label: 'Quest',
      render: (quest) => (
        <Link className="type-title" to={`/quests/${quest.shortCode}`}>
          {quest.briefDocument?.title ?? quest.shortCode}
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
        title="DM dashboard"
        meta={
          <>
            <span>{pluralize(data.quests.total, 'quest')} posted</span>
            {data.dmStats ? (
              <span>{pluralize(data.dmStats.sessionCount, 'session')} run</span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link className="btn btn--secondary" to="/me">
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
      <Card className="stack">
        <h2 className="type-heading">Your quests</h2>
        <AdminPagination page={view.questPage} />
        {data.quests.items.length === 0 ? (
          <EmptyState
            kind="generic"
            message="You have not posted any quests yet."
            action={
              view.canCreateQuest ? (
                <Link className="btn btn--primary btn--sm" to="/quests/new">
                  Post a quest
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table
            className="dm-dashboard__quests type-caption"
            columns={columns}
            rows={data.quests.items}
            rowKey={(quest) => quest.id}
          />
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
          <ul className="dm-dashboard__tables">
            {data.documents.items.map((table) => (
              <li key={table.id} className="dm-dashboard__table">
                <Link className="type-title" to={`/community/dm-table/${table.slug}`}>
                  {table.title}
                </Link>
                <p className="type-caption">{statusLabel(table.status)}</p>
                {table.canEditMetadata ? (
                  <Link className="type-link" to={`/editor/dm-table/${table.id}/edit`}>
                    Edit table
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
