import { StatePanel } from '../../components/foundation/StatePanel.js';
import { EditorShell } from './EditorShell.js';
import { EditorSummaryLinks } from './EditorSummaryLinks.js';
import { EditorDocumentControls } from './EditorDocumentControls.js';
import styles from './editor.module.css';
import type { EditorWorkspaceView } from './hooks/useEditorWorkspace.js';

const editorLabels = {
  quest: 'quest',
  codex: 'Codex entry',
  summary: 'session summary',
  guide: 'guide',
  ruling: 'ruling',
  'dm-table': 'DM table',
  demo: 'editor example',
} as const;

function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Props-only view; the page composition hook owns draft and transport state. */
export function EditorWorkspace({
  view,
}: {
  view: EditorWorkspaceView;
}): React.JSX.Element {
  return (
    <div
      className={`hf2 editor-workspace stack ${styles.workspace}`}
      data-layout="editor-workspace"
    >
      {view.denied ? (
        // A viewer without edit rights gets the document's name, not an "Edit" verb.
        <header className={`stack ${styles.header}`}>
          <p className="eyebrow">{sentence(editorLabels[view.typeKey])}</p>
          <h1 className="type-display">
            {view.deniedAction === 'create'
              ? `New ${editorLabels[view.typeKey]}`
              : view.meta.title.trim() || sentence(editorLabels[view.typeKey])}
          </h1>
        </header>
      ) : (
        <header className={`stack ${styles.header}`}>
          <h1 className="type-display">
            {view.mode === 'edit' ? 'Edit' : 'Create'} {editorLabels[view.typeKey]}
          </h1>
          {view.mode === 'edit' && view.meta.title.trim() ? (
            <p className="type-caption">{view.meta.title}</p>
          ) : null}
        </header>
      )}
      <EditorSummaryLinks view={view.summaryLinks} disabled={!view.canEditMetadata} />
      <EditorShell
        {...view}
        errorSlot={
          <>
            {view.mutationError ? (
              <StatePanel status="error" error={view.mutationError} />
            ) : null}
            {view.entityIndexError ? (
              <StatePanel status="error" error={view.entityIndexError} />
            ) : null}
          </>
        }
      />
      <EditorDocumentControls view={view} />
    </div>
  );
}
