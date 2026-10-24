import { useId, useState } from 'react';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { usePrivateNotes } from '../hooks/usePrivateNotes.js';
import styles from '../pages/privateNotes.module.css';

function NotesIcon(): React.JSX.Element {
  return (
    <svg
      className={styles.emptyIcon}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </svg>
  );
}

function LockIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Standalone: owns its draft, which is lost when this unmounts. */
export function PrivateNotes(): React.JSX.Element {
  return <PrivateNotesPanel notes={usePrivateNotes()} />;
}

/** Renders notes whose draft lives above the tab strip, so switching tabs keeps it. */
export function PrivateNotesPanel({
  notes,
}: {
  notes: ReturnType<typeof usePrivateNotes>;
}): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const [writing, setWriting] = useState(false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const fieldId = useId();
  const counterId = `${fieldId}-count`;

  let body: React.JSX.Element;
  if (notes.status === 'error') {
    body = (
      <StatePanel
        variant="inline"
        status="error"
        error={notes.error}
        onRetry={notes.retry}
        retryLabel="Retry notes"
      />
    );
  } else if (notes.status === 'loading') {
    body = (
      <div className="stack" data-gap="2" aria-busy="true">
        <Skeleton width="12rem" height="1rem" aria-label="Loading private notes" />
        <Skeleton height="14rem" aria-label="Loading private notes" />
      </div>
    );
  } else if (notes.status === 'empty' && !writing && !notes.dirty) {
    body = (
      <EmptyState
        className={styles.empty}
        illustration={<NotesIcon />}
        message="No notes yet."
        actionLabel="Start writing"
        onAction={() => setWriting(true)}
      >
        <p className="type-caption">
          Keep names, debts, rumours and plans here. Markdown works.
        </p>
      </EmptyState>
    );
  } else {
    const updatedAt = notes.status === 'ready' ? notes.view.updatedAt : null;
    body = (
      <div className="stack" data-gap="3">
        <SegmentedControl
          aria-label="Notes view"
          size="sm"
          className={styles.notesControl}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        {mode === 'write' ? (
          <div className="field" data-invalid={notes.overLimit ? 'true' : 'false'}>
            <label htmlFor={fieldId} className="type-label">
              Notes (Markdown)
            </label>
            <textarea
              id={fieldId}
              className={`field-input ${styles.editor}`}
              rows={12}
              aria-describedby={counterId}
              aria-invalid={notes.overLimit || undefined}
              disabled={notes.saving}
              value={notes.text}
              onChange={(event) => notes.setText(event.target.value)}
            />
          </div>
        ) : (
          <div className={styles.preview} aria-label="Notes preview">
            {notes.text.trim() ? (
              <ContentRenderer body={notes.text} />
            ) : (
              <p className="type-caption">Nothing to preview yet.</p>
            )}
          </div>
        )}
        <div className={styles.footer}>
          <span
            id={counterId}
            className={`type-caption ${styles.counter}`}
            data-over={notes.overLimit ? 'true' : 'false'}
          >
            {notes.length.toLocaleString('en-GB')} / {notes.max.toLocaleString('en-GB')}{' '}
            characters
            {notes.overLimit ? ' · too long to save' : ''}
          </span>
          <div className="row" data-wrap="1">
            {notes.saveError ? (
              <p
                className={`type-caption ${styles.feedback}`}
                data-tone="error"
                role="alert"
              >
                Not saved. {notes.saveError.userMessage}
              </p>
            ) : (
              <p className={`type-caption ${styles.feedback}`} role="status">
                {notes.justSaved
                  ? 'Saved.'
                  : notes.dirty
                    ? 'Unsaved changes.'
                    : updatedAt
                      ? `Last saved ${formatDateTime(updatedAt)}`
                      : ''}
              </p>
            )}
            <Button
              onClick={notes.save}
              pending={notes.saving}
              disabled={!notes.dirty || notes.overLimit}
            >
              {notes.saving ? 'Saving…' : 'Save notes'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card as="section" className="stack" pad={4} aria-labelledby={`${fieldId}-heading`}>
      <div className={styles.heading}>
        <div className={styles.title}>
          <p className={`type-label ${styles.kicker}`}>Private to you</p>
          <h2 id={`${fieldId}-heading`} className="type-heading">
            Notes
          </h2>
        </div>
        <p className={`type-caption ${styles.privacy}`}>
          <LockIcon />
          Only you can see these.
        </p>
      </div>
      {body}
    </Card>
  );
}
