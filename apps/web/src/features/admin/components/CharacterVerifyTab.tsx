import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { personLabels } from '../../../utils/format.js';
import { isSafeDdbUrl } from '../../../utils/url.js';
import type { useCharacterVerifyTab } from '../hooks/useCharacterVerifyTab.js';

export function CharacterVerifyTab({
  view,
}: {
  view: ReturnType<typeof useCharacterVerifyTab>;
}): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const { queue, feedback, decide } = view;

  if (queue.isError) {
    return <AdminReadFailure error={queue.error} retry={queue.retry} />;
  }
  if (queue.isLoading || !queue.data) {
    return <StatePanel status="loading" />;
  }

  const feedbackNode = feedback ? (
    <div
      role={feedback.type === 'error' ? 'alert' : 'status'}
      aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
      data-el="character.verifyDecisionFeedback"
      className="type-caption"
    >
      {feedback.message}
    </div>
  ) : null;

  if (queue.data.length === 0) {
    return (
      <div className="stack">
        <AdminPagination page={view.pagination} />
        {feedbackNode}
        <EmptyState
          kind="no-characters"
          message="Nothing to review. No characters are waiting for verification."
        />
      </div>
    );
  }

  const ownerLabels = personLabels(queue.data.map((row) => ({
    displayName: row.ownerDisplayName,
    handle: row.ownerHandle,
  })));

  return (
    <div className="stack" data-testid="character-verify-rows">
      {feedbackNode}
      <AdminPagination page={view.pagination} />
      <ul className="stack">
        {queue.data.map((row, index) => {
          const ddbUrl = isSafeDdbUrl(row.ddbUrl) ? row.ddbUrl : null;
          return (
            <li key={row.id} className="card stack">
              <Link className="type-title" to={`/characters/${row.shortCode}`}>
                {row.name}
              </Link>
              <p className="type-caption">
                Played by {ownerLabels[index]}.{' '}
                {row.verificationSubmittedAt
                  ? `Submitted ${formatDate(row.verificationSubmittedAt)}. `
                  : ''}
                {ddbUrl ? (
                  <a href={ddbUrl} target="_blank" rel="noopener noreferrer">
                    D&amp;D Beyond sheet
                  </a>
                ) : (
                  'No D&D Beyond link.'
                )}
              </p>
              <div className="row">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={decide.isPending || row.verificationSubmittedAt === null}
                  onClick={() =>
                    decide.mutate({
                      characterId: row.id,
                      approve: false,
                      note: null,
                      expectedSubmissionAt: row.verificationSubmittedAt,
                    })
                  }
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={decide.isPending || row.verificationSubmittedAt === null}
                  onClick={() =>
                    decide.mutate({
                      characterId: row.id,
                      approve: true,
                      note: null,
                      expectedSubmissionAt: row.verificationSubmittedAt,
                    })
                  }
                >
                  Approve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
