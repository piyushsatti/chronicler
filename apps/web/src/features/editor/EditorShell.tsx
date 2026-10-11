import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/primitives/Button.js';
import { Card } from '../../components/primitives/Card.js';
import { ContentRenderer } from '../../components/foundation/ContentRenderer.js';
import { LiveEditor } from './LiveEditor.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { schemaForType } from './editorSchemas.js';
import type { EditorMeta as LoadMeta } from './adapters/editorLoad.js';
import type { EditorFieldOptions, EditorPreview, EditorTypeKey } from './types.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import type { EditorMeta, EntityLinkIndex } from './types.js';

export type ShellMode = 'edit' | 'read';

export type EditorShellProps = {
  typeKey: EditorTypeKey;
  meta: LoadMeta;
  setMeta: React.Dispatch<React.SetStateAction<LoadMeta>>;
  body: string;
  setBody: (v: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  publishDisabled?: boolean;
  saveDisabled?: boolean;
  cancelTo: string;
  isDirty?: boolean;
  preview: EditorPreview;
  onPreview: () => void;
  options: EditorFieldOptions;
  statusMessage?: string | null;
  errorSlot?: React.ReactNode;
  showPropertyErrors?: boolean;
  entityIndex?: EntityLinkIndex;
  slugLocked?: boolean;
};

export function EditorShell({
  typeKey,
  meta,
  setMeta,
  body,
  setBody,
  onSaveDraft,
  onPublish,
  publishDisabled,
  saveDisabled,
  cancelTo,
  isDirty,
  preview,
  onPreview,
  options,
  statusMessage,
  errorSlot,
  showPropertyErrors = false,
  entityIndex,
  slugLocked = false,
}: EditorShellProps): React.JSX.Element {
  const [mode, setMode] = useState<ShellMode>('edit');
  const schema = schemaForType(typeKey, meta as EditorMeta);

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSaveDraft();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onSaveDraft]);

  return (
    <Card className="editor-shell stack" data-component="EditorShell" data-mode={mode}>
      <div className="row" data-justify="between" data-wrap="1">
        <div className="row" role="tablist" aria-label="Editor mode">
          <Button
            type="button"
            size="sm"
            variant={mode === 'edit' ? 'primary' : 'ghost'}
            onClick={() => setMode('edit')}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'read' ? 'primary' : 'ghost'}
            onClick={() => {
              onPreview();
              setMode('read');
            }}
          >
            Read
          </Button>
        </div>
        <div className="row">
          {isDirty ? (
            <span className="type-caption" role="status">
              Unsaved draft
            </span>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={saveDisabled}
            onClick={onSaveDraft}
          >
            Save draft
          </Button>
          <Button type="button" disabled={publishDisabled} onClick={onPublish}>
            Publish
          </Button>
          <Link className="btn btn--ghost" to={cancelTo}>
            Cancel
          </Link>
        </div>
      </div>

      <aside className="editor-shell__properties stack" aria-label="Properties">
        <PropertiesPanel
          schema={schema}
          values={meta as EditorMeta}
          setValue={(key, val) => setMeta((prev) => ({ ...prev, [key]: val }))}
          showErrors={showPropertyErrors}
          slugLocked={slugLocked || typeKey !== 'quest'}
          options={options}
        />
      </aside>

      {mode === 'edit' ? (
        <LiveEditor
          value={body}
          onChange={setBody}
          placeholder={`${typeKey} body…`}
          entityIndex={entityIndex}
        />
      ) : (
        <section className="stack" aria-label="Read preview">
          {preview.status === 'error' ? (
            <StatePanel status="error" error={preview.error} />
          ) : preview.status === 'loading' || preview.status === 'idle' ? (
            <StatePanel status="loading" />
          ) : (
            <ContentRenderer body={preview.body} />
          )}
          {preview.status === 'error' ? (
            <Button type="button" variant="secondary" onClick={onPreview}>
              Retry preview
            </Button>
          ) : null}
        </section>
      )}

      {statusMessage ? (
        <p className="type-caption" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorSlot}
    </Card>
  );
}
