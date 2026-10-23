import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { handleLabel, personName, statusLabel } from '../../../utils/format.js';
import type { useDmProfileVerifyTab } from '../hooks/useDmProfileVerifyTab.js';

export function DmProfileVerifyTab({
  view,
}: {
  view: ReturnType<typeof useDmProfileVerifyTab>;
}): React.JSX.Element {
  const memberHref = useMemberHref();
  const { queue, noteById, setNoteById, feedback, feedbackIsError, decide } = view;

  if (queue.isError) {
    return <AdminReadFailure error={queue.error} retry={queue.retry} />;
  }
  if (queue.isLoading || !queue.data) {
    return <StatePanel status="loading" />;
  }
  if (queue.data.length === 0) {
    return (
      <div className="stack">
        <AdminPagination page={view.pagination} />
        {feedback ? (
          <p className="type-caption" role={feedbackIsError ? 'alert' : 'status'}>
            {feedback}
          </p>
        ) : null}
        <EmptyState kind="generic" message="No DM profiles awaiting review." />
      </div>
    );
  }

  return (
    <div className="stack" data-testid="dm-profile-verify-rows">
      {feedback ? (
        <p className="type-caption" role={feedbackIsError ? 'alert' : 'status'}>
          {feedback}
        </p>
      ) : null}
      <AdminPagination page={view.pagination} />
      <ul className="stack">
        {queue.data.map((row) => (
          <li key={row.memberId} className="card stack">
            <p className="type-title">{personName(row)}</p>
            <div className="row" data-wrap="1" data-gap="2">
              {handleLabel(row.handle) ? (
                <span className="type-caption">{handleLabel(row.handle)}</span>
              ) : null}
              {row.status ? <Chip size="sm">{statusLabel(row.status)}</Chip> : null}
            </div>
            <Link className="type-link" to={memberHref(row, 'dm')}>
              Open DM profile
            </Link>
            <label className="stack">
              <span className="type-label">What does the owner need to change?</span>
              <textarea
                disabled={decide.isPending}
                className="field-input"
                rows={2}
                value={noteById[row.memberId] ?? ''}
                onChange={(event) =>
                  setNoteById((current) => ({
                    ...current,
                    [row.memberId]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="row">
              <Button
                type="button"
                disabled={decide.isPending || row.reviewRevision == null}
                onClick={() => {
                  if (row.reviewRevision == null) return;
                  decide.mutate({
                    memberId: row.memberId,
                    approve: true,
                    note: null,
                    expectedRevision: row.reviewRevision,
                  });
                }}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  decide.isPending ||
                  row.reviewRevision == null ||
                  !(noteById[row.memberId] ?? '').trim()
                }
                onClick={() => {
                  if (row.reviewRevision == null) return;
                  decide.mutate({
                    memberId: row.memberId,
                    approve: false,
                    note: (noteById[row.memberId] ?? '').trim(),
                    expectedRevision: row.reviewRevision,
                  });
                }}
              >
                Request changes
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
