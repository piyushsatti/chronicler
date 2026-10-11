import { StatePanel } from '../../components/foundation/StatePanel.js';
import { EditorShell } from './EditorShell.js';
import type { EditorWorkspaceView } from './hooks/useEditorWorkspace.js';

/** Props-only view; the page composition hook owns draft and transport state. */
export function EditorWorkspace({
  view,
}: {
  view: EditorWorkspaceView;
}): React.JSX.Element {
  return (
    <div className="editor-workspace stack" data-layout="editor-workspace">
      <header className="stack">
        <p className="eyebrow">Editor workspace</p>
        <h1 className="type-display">
          {view.typeKey} — {view.mode}
        </h1>
        <p className="type-caption">
          {view.mode === 'edit' ? 'Loaded for edit' : 'New draft'}
          {view.recordId !== 'new' ? (
            <>
              {' '}
              · <code>{view.recordId}</code>
            </>
          ) : null}
        </p>
      </header>
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
    </div>
  );
}
