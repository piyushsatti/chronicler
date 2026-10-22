import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Table, type Column } from '../../../components/primitives/Table.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { statusLabel } from '../../../utils/format.js';
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
        <span className="chip" data-tone="line">
          {statusLabel(quest.status)}
        </span>
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
        quest.scheduledAt ? (
          <time dateTime={quest.scheduledAt}>{formatDateTime(quest.scheduledAt)}</time>
        ) : (
          'Unscheduled'
        ),
    },
    {
      key: 'manage',
      label: 'Manage',
      render: (quest) => (
        <Link className="type-link" to={`/quests/${quest.shortCode}`}>
          Manage participation, attendance and summary
        </Link>
      ),
    },
  ];
  return (
    <div className="dm-dashboard stack">
      <div className="row" data-wrap="1">
        {view.canCreateQuest ? (
          <Link className="btn btn--secondary" to="/quests/new">
            Create quest
          </Link>
        ) : null}
        <Link className="type-link" to="/me">
          Edit DM profile and availability
        </Link>
      </div>
      <p className="type-caption">
        {data.dmStats
          ? `${data.dmStats.sessionCount} recorded sessions`
          : 'Session statistics unavailable.'}
      </p>
      <Card className="stack">
        <h2 className="type-heading">Your quests</h2>
        <AdminPagination page={view.questPage} />
        {data.quests.items.length === 0 ? (
          <EmptyState kind="generic" message="No quests on this page." />
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
        <h2 className="type-heading">Your DM tables</h2>
        <Link className="type-link" to="/editor/dm-table">
          Create DM table
        </Link>
        <AdminPagination page={view.tablePage} />
        {data.documents.items.length === 0 ? (
          <EmptyState kind="generic" message="No DM tables on this page." />
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
