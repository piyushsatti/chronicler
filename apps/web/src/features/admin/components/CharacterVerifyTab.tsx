import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { handleOnlyName } from '../../../utils/format.js';
import { isSafeDdbUrl } from '../../../utils/url.js';
import type { useCharacterVerifyTab } from '../hooks/useCharacterVerifyTab.js';

export function CharacterVerifyTab({
  view,
}: {
  view: ReturnType<typeof useCharacterVerifyTab>;
}): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const {
    queue,
    changeRequestId,
    setChangeRequestId,
    changeRequestNote,
    setChangeRequestNote,
    noteError,
    setNoteError,
    feedback,
    decide,
  } = view;

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

  return (
    <div className="stack" data-testid="character-verify-rows">
      {feedbackNode}
      <AdminPagination page={view.pagination} />
      <ul className="stack">
        {queue.data.map((row) => {
          const ddbUrl = isSafeDdbUrl(row.ddbUrl) ? row.ddbUrl : null;
          return (
            <li key={row.id} className="card stack">
              <Link className="type-title" to={`/characters/${row.shortCode}`}>
                {row.name}
              </Link>
              <p className="type-caption">
                {row.ownerHandle
                  ? `Played by ${handleOnlyName(row.ownerHandle)}. `
                  : ''}
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
                  onClick={() => {
                    setChangeRequestId((current) =>
                      current === row.id ? null : row.id,
                    );
                    setChangeRequestNote('');
                    setNoteError(null);
                  }}
                >
                  Request changes
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
              {changeRequestId === row.id ? (
                <form
                  className="stack"
                  data-testid={`change-request-form-${row.id}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const note = changeRequestNote.trim();
                    if (!note) {
                      setNoteError(
                        'Add a note describing the changes the owner needs to make.',
                      );
                      return;
                    }
                    setNoteError(null);
                    decide.mutate({
                      characterId: row.id,
                      approve: false,
                      note,
                      expectedSubmissionAt: row.verificationSubmittedAt,
                    });
                  }}
                >
                  <label className="stack">
                    <span className="type-label">
                      What does the owner need to change?
                    </span>
                    <textarea
                      disabled={
                        decide.isPending || row.verificationSubmittedAt === null
                      }
                      className="field-input"
                      rows={2}
                      value={changeRequestNote}
                      onChange={(event) => setChangeRequestNote(event.target.value)}
                    />
                  </label>
                  {noteError ? (
                    <p className="type-caption" role="alert">
                      {noteError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={decide.isPending || row.verificationSubmittedAt === null}
                  >
                    Send change request
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
