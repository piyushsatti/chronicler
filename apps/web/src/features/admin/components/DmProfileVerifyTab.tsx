import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useDmProfileVerifyTab } from '../hooks/useDmProfileVerifyTab.js';

export function DmProfileVerifyTab({
  view,
}: {
  view: ReturnType<typeof useDmProfileVerifyTab>;
}): React.JSX.Element {
  const { queue, noteById, setNoteById, feedback, feedbackIsError, decide } = view;

  if (queue.isError) {
    return <StatePanel status="error" error={queue.error} />;
  }
  if (queue.isLoading || !queue.data) {
    return <StatePanel status="loading" />;
  }
  if (queue.data.length === 0) {
    return (
      <div className="stack">
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
      <ul className="stack">
        {queue.data.map((row) => (
          <li key={row.memberId} className="card stack">
            <p className="type-title">{row.displayName}</p>
            <p className="type-caption">
              @{row.handle}
              {row.status ? ` · ${row.status}` : ''}
            </p>
            <Link className="type-link" to={`/dms/@${row.handle}`}>
              Open DM profile
            </Link>
            <label className="stack">
              <span className="type-label">Change-request note</span>
              <textarea
                className="field"
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
