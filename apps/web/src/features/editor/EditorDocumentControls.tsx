import { SegmentedControl } from '../../components/primitives/SegmentedControl.js';
import { Modal } from '../../components/primitives/Modal.js';
import { Card } from '../../components/primitives/Card.js';
import { formatInstant } from '../../utils/format.js';
import styles from './editor.module.css';
import { Button } from '../../components/primitives/Button.js';
import { ContentRenderer } from '../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { toAppError } from '../../errors/toAppError.js';
import type { EditorWorkspaceView } from './hooks/useEditorWorkspace.js';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'dm_only', label: 'DM only' },
  { value: 'restricted', label: 'Restricted' },
];

const POLICY_OPTIONS: { value: 'visibility' | 'custom'; label: string }[] = [
  { value: 'visibility', label: 'Same as visibility' },
  { value: 'custom', label: 'Choose readers' },
];

function HistoryGlyph(): React.JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function EditorDocumentControls({
  view,
}: {
  view: EditorWorkspaceView;
}): React.JSX.Element {
  const history = view.history;
  return (
    <>
      <Modal
        open={view.navigationBlocked}
        title="Leave with unsaved changes?"
        onClose={view.stay}
      >
        <p>Your recovery copy stays in this browser for this account and revision.</p>
        <div className="row">
          <Button type="button" onClick={view.stay}>
            Keep editing
          </Button>
          <Button type="button" variant="secondary" onClick={view.leave}>
            Leave page
          </Button>
        </div>
      </Modal>
      {view.stale || view.mutationError ? (
        <div className="stack">
          <p className="type-caption">
            Your edits remain in this account’s recovery copy. Reload before retrying a
            conflicting or revoked edit.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void view.onReload();
            }}
          >
            Discard local edits and reload
          </Button>
        </div>
      ) : null}
      {view.showLifecycle ? (
        <Card
          as="section"
          className={`stack ${styles.panel}`}
          aria-label="Visibility and publishing"
        >
          <h2 className="type-heading">Visibility and publishing</h2>
          <p className="type-caption">
            Save or discard edits before changing publication or audience. Changes apply
            immediately.
          </p>
          {view.trashed || view.published ? (
            <div className="row" data-wrap="1" data-gap="2">
              {view.trashed ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={view.lifecycleDisabled}
                  onClick={() => view.onLifecycle({ action: 'restore' })}
                >
                  Restore document
                </Button>
              ) : (
                <>
                  {view.published ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={view.lifecycleDisabled}
                      onClick={() => view.onLifecycle({ action: 'unpublish' })}
                    >
                      Unpublish
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {!view.trashed ? (
            <fieldset
              className={`stack ${styles.fields}`}
              disabled={view.lifecycleDisabled}
            >
              <legend className={styles.srLegend}>Visibility</legend>
              <div className="field">
                <span className="field-label">Visibility</span>
                <SegmentedControl
                  aria-label="Visibility"
                  size="sm"
                  value={view.visibility}
                  onValueChange={view.setVisibility}
                  options={VISIBILITY_OPTIONS}
                />
              </div>
              <div className="field">
                <span className="field-label">Who can read this</span>
                <SegmentedControl<'visibility' | 'custom'>
                  aria-label="Who can read this"
                  size="sm"
                  value={view.policyMode}
                  onValueChange={view.setPolicyMode}
                  options={POLICY_OPTIONS}
                />
              </div>
              {view.policyMode === 'custom' ? (
                <>
                  <label className="field">
                    <span className="field-label">Reader handles</span>
                    <input
                      className="field-input"
                      value={view.policy}
                      onChange={(event) => view.setPolicy(event.target.value)}
                      placeholder="member:@handle, role:dm"
                    />
                  </label>
                  <p className="type-caption">
                    Chosen readers replace the visibility setting. An empty list lets no
                    one read this.
                  </p>
                </>
              ) : (
                <p className="type-caption">
                  Readers follow the visibility above and any members you add.
                </p>
              )}
              <label className="field">
                <span className="field-label">Find a reader by name or handle</span>
                <input
                  className="field-input"
                  placeholder="Search members"
                  value={view.audience.search}
                  onChange={(event) => view.audience.setSearch(event.target.value)}
                />
              </label>
              <ul className={styles.items} aria-label="Selected readers">
                {view.audience.selected.map((reader) => (
                  <li key={reader.id}>
                    {reader.label}{' '}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => view.audience.remove(reader.id)}
                    >
                      Remove {reader.label}
                    </Button>
                  </li>
                ))}
              </ul>
              {view.audience.error ? (
                <StatePanel
                  status="error"
                  error={toAppError(view.audience.error, 'editor:readers')}
                />
              ) : null}
              {view.audience.loading ? <StatePanel status="loading" /> : null}
              <ul className={styles.items} aria-label="Matching members">
                {view.audience.matches.map((member) => (
                  <li key={member.memberId}>
                    {member.displayName} (@{member.handle}){' '}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={view.audience.selectedIds.includes(member.memberId)}
                      onClick={() => view.audience.add(member.memberId)}
                    >
                      Add @{member.handle}
                    </Button>
                  </li>
                ))}
              </ul>
              {view.audience.search.trim() &&
              !view.audience.loading &&
              view.audience.matches.length === 0 &&
              !view.audience.error ? (
                <p className="type-caption">No matching members.</p>
              ) : null}
              {view.audience.offset > 0 || view.audience.total > 20 ? (
                <div className="row" data-wrap="1" data-gap="2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={view.audience.offset === 0 || view.audience.loading}
                    onClick={view.audience.previous}
                  >
                    Previous members
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      view.audience.offset + 20 >= view.audience.total ||
                      view.audience.loading
                    }
                    onClick={view.audience.next}
                  >
                    More members
                  </Button>
                </div>
              ) : null}
              <div className="row" data-justify="end">
                <Button type="button" variant="secondary" onClick={view.saveAudience}>
                  Save readers
                </Button>
              </div>
            </fieldset>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className={styles.historyToggle}
            aria-expanded={history.open}
            onClick={history.toggle}
          >
            <HistoryGlyph />
            Revision history
            {history.total > 0 ? (
              <span className={`type-caption ${styles.historyCount}`}>
                {history.total}
              </span>
            ) : null}
          </Button>
          {history.open ? (
            <section className="stack" aria-label="Revision history">
              <p className="type-caption">
                Historical revisions are read-only. They never replace your current
                draft.
              </p>
              {history.error ? (
                <StatePanel
                  status="error"
                  error={toAppError(history.error, 'editor:revisions')}
                />
              ) : history.loading ? (
                <StatePanel status="loading" />
              ) : history.items.length === 0 ? (
                <StatePanel status="empty" emptyMessage="No recorded revisions." />
              ) : (
                history.items.map((revision) => (
                  <details key={revision.id}>
                    <summary>
                      Revision {revision.rev}: {revision.title},{' '}
                      {formatInstant(revision.recordedAt, view.timeZone)}
                    </summary>
                    <p className="type-caption">{revision.reason}</p>
                    <ContentRenderer body={revision.body} />
                  </details>
                ))
              )}
              <div className="row" data-wrap="1" data-gap="2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={history.offset === 0 || history.fetching}
                  onClick={history.previous}
                >
                  Previous revisions
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={history.offset + 20 >= history.total || history.fetching}
                  onClick={history.next}
                >
                  More revisions
                </Button>
              </div>
            </section>
          ) : null}
          {!view.trashed ? (
            <div className={`action-row ${styles.dangerZone}`}>
              <p className="type-caption">
                Moving this to the trash hides it from everyone. You can restore it
                later.
              </p>
              <Button
                type="button"
                variant="danger"
                className="action-row__danger"
                disabled={view.lifecycleDisabled}
                onClick={() => {
                  if (
                    window.confirm('Move this document to trash? It can be restored.')
                  )
                    view.onLifecycle({ action: 'delete' });
                }}
              >
                Move to trash
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
