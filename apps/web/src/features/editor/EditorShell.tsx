import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/primitives/Button.js';
import { Card } from '../../components/primitives/Card.js';
import { ContentRenderer } from '../../components/foundation/ContentRenderer.js';
import { LiveEditor } from './LiveEditor.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { schemaForType, type SchemaAccess } from './editorSchemas.js';
import styles from './editor.module.css';
import { EDITOR_BACK_LABELS } from './editorConstants.js';
import type { EditorMeta as LoadMeta } from './adapters/editorLoad.js';
import type { EditorFieldOptions, EditorPreview, EditorTypeKey } from './types.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import type { EntityLinkIndex } from './types.js';

export type ShellMode = 'edit' | 'read';

const MODE_TABS: { value: ShellMode; label: string }[] = [
  { value: 'edit', label: 'Write' },
  { value: 'read', label: 'Preview' },
];

function HistoryIcon({ direction }: { direction: 'undo' | 'redo' }): React.JSX.Element {
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
      className={direction === 'redo' ? styles.flip : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

/** Read-only page address with a copy button, tucked in an Advanced disclosure. */
function PageAddress({ address }: { address: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <details className={styles.advanced}>
      <summary className="type-label">Advanced</summary>
      <div className="row" data-gap="2" data-wrap="1">
        <span className="type-caption">Page address</span>
        <code className={`type-caption ${styles.address}`}>{address}</code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </details>
  );
}

const DENIED_NOUNS: Record<EditorTypeKey, string> = {
  quest: 'quest',
  codex: 'Codex entry',
  summary: 'session summary',
  guide: 'guide',
  ruling: 'ruling',
  'dm-table': 'DM table',
  demo: 'example',
};

/** Who may start each type, as the API's create rules put it. */
const CREATE_DENIAL: Record<EditorTypeKey, { title: string; body: string }> = {
  quest: {
    title: 'You can’t post quests',
    body: 'Only DMs with an approved DM profile, and admins, can post quests. If you run games here, ask an admin for the DM role or to review your DM profile.',
  },
  codex: {
    title: 'You can’t add Codex entries',
    body: 'Your account can’t write here.',
  },
  summary: {
    title: 'You can’t write session summaries',
    body: 'Session summaries are written by players and DMs of the session.',
  },
  guide: {
    title: 'You can’t write guides',
    body: 'Guides are written by verifiers and admins. Ask one of them to make the change.',
  },
  ruling: {
    title: 'You can’t record rulings',
    body: 'Rulings are recorded by verifiers and admins. Ask one of them to log it.',
  },
  'dm-table': {
    title: 'You can’t create a DM table',
    body: 'A DM table describes how a DM runs games. Once you have the DM role, you can set yours up here.',
  },
  demo: { title: 'You can’t use this editor', body: 'Your account can’t write here.' },
};

const BODY_PLACEHOLDERS: Record<EditorTypeKey, string> = {
  quest: 'Describe the quest for players…',
  codex: 'Write the entry…',
  summary: 'Tell what happened at the table…',
  guide: 'Explain how this works…',
  ruling: 'State the ruling and the reason for it…',
  'dm-table': 'Describe your table…',
  demo: 'Write something…',
};

export type EditorShellProps = {
  typeKey: EditorTypeKey;
  timeZone: string;
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
  canEditBody?: boolean;
  canEditMetadata?: boolean;
  denied?: boolean;
  /** With `denied`: the quest has no brief yet, which is not a permission problem. */
  briefMissing?: boolean;
  /** With `denied`: whether the account may not edit this record or not create one. */
  deniedAction?: 'edit' | 'create';
  schemaAccess?: SchemaAccess;
  saveLabel?: string;
  publishLabel?: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

export function EditorShell({
  typeKey,
  timeZone,
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
  canEditBody = true,
  canEditMetadata = true,
  denied = false,
  briefMissing = false,
  deniedAction = 'edit',
  schemaAccess,
  saveLabel = 'Save draft',
  publishLabel = 'Publish',
  undo,
  redo,
  canUndo,
  canRedo,
}: EditorShellProps): React.JSX.Element {
  const [mode, setMode] = useState<ShellMode>('edit');
  const schema = schemaForType(typeKey, meta, schemaAccess);
  // The page address is assigned on create and never typed by the author: new
  // items hide it, saved items show it once, read-only, under Advanced.
  const visibleSchema = schema.filter((field) => field.key !== 'slug');
  const pageAddress =
    typeof meta.slug === 'string' && meta.slug.trim() ? meta.slug.trim() : null;

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (
        (e.metaKey || e.ctrlKey) &&
        undo &&
        e.target instanceof Element &&
        e.target.closest('[data-component="EditorShell"]') &&
        (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        if (canEditMetadata) {
          if ((e.shiftKey || e.key.toLowerCase() === 'y') && canRedo) redo?.();
          else if (!e.shiftKey && canUndo) undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!saveDisabled) onSaveDraft();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onSaveDraft, saveDisabled, undo, redo, canUndo, canRedo, canEditMetadata]);

  if (denied) {
    const noun = DENIED_NOUNS[typeKey];
    const creating = deniedAction === 'create';
    const copy = creating
      ? CREATE_DENIAL[typeKey]
      : {
          title: `You can’t edit this ${noun}`,
          body:
            typeKey === 'quest'
              ? 'Only the quest’s DM and admins can change it.'
              : `Your account doesn’t have edit rights for this ${noun}.`,
        };
    return (
      <Card
        as="section"
        className={`editor-shell stack ${styles.denied}`}
        data-component="EditorShell"
        data-state={briefMissing ? 'brief-missing' : 'denied'}
        data-gap="3"
        aria-labelledby="editor-denied-title"
      >
        {briefMissing ? (
          <h2 className="type-title" id="editor-denied-title">
            This quest has no brief to edit yet
          </h2>
        ) : (
          <>
            <h2 className="type-title" id="editor-denied-title">
              {copy.title}
            </h2>
            <p className="type-body">{copy.body}</p>
          </>
        )}
        <div className="row" data-wrap="1" data-gap="2">
          <Link className="btn btn--secondary" to={cancelTo}>
            {typeKey === 'quest' && !creating
              ? 'Back to the quest'
              : EDITOR_BACK_LABELS[typeKey]}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="editor-shell stack" data-component="EditorShell" data-mode={mode}>
      <div className={`row ${styles.toolbar}`} data-wrap="1">
        <div className={`row ${styles.tools}`}>
          <div className="tabs" data-component="Tabs">
            <div className="tabs__list" role="tablist" aria-label="Editor mode">
              {MODE_TABS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`editor-mode-${value}`}
                  aria-controls="editor-body"
                  aria-selected={mode === value}
                  tabIndex={mode === value ? 0 : -1}
                  className="tabs__tab"
                  onClick={() => {
                    if (value === 'read') onPreview();
                    setMode(value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const next = value === 'edit' ? 'read' : 'edit';
                    if (next === 'read') onPreview();
                    setMode(next);
                    document.getElementById(`editor-mode-${next}`)?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {undo || redo ? (
            <div className="row" role="group" aria-label="History" data-gap="1">
              {undo ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Undo"
                  title="Undo"
                  disabled={!canUndo || !canEditMetadata}
                  onClick={undo}
                >
                  <HistoryIcon direction="undo" />
                </Button>
              ) : null}
              {redo ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Redo"
                  title="Redo"
                  disabled={!canRedo || !canEditMetadata}
                  onClick={redo}
                >
                  <HistoryIcon direction="redo" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={`row ${styles.actions}`}>
          {isDirty ? (
            <span className="type-caption" role="status">
              Unsaved draft
            </span>
          ) : null}
          {typeKey !== 'quest' ? (
            <Button type="button" disabled={publishDisabled} onClick={onPublish}>
              {publishLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={typeKey === 'quest' ? 'primary' : 'secondary'}
            disabled={saveDisabled}
            onClick={onSaveDraft}
          >
            {saveLabel}
          </Button>
          <Link className="btn btn--ghost" to={cancelTo}>
            Cancel
          </Link>
        </div>
      </div>

      <fieldset
        className="editor-shell__properties stack"
        aria-label="Properties"
        disabled={!canEditMetadata}
      >
        <PropertiesPanel
          schema={visibleSchema}
          timeZone={timeZone}
          values={meta}
          setValue={(key, val) => setMeta((prev) => ({ ...prev, [key]: val }))}
          showErrors={showPropertyErrors}
          slugLocked={slugLocked || typeKey !== 'quest'}
          options={options}
        />
      </fieldset>
      {pageAddress ? <PageAddress address={pageAddress} /> : null}

      <div
        id="editor-body"
        role="tabpanel"
        aria-labelledby={`editor-mode-${mode}`}
        className="stack"
      >
        {!canEditBody ? (
          <section className="stack" aria-label="Body editing unavailable">
            <p className="type-caption">
              Body editing is currently unavailable. Metadata changes preserve the
              source body.
            </p>
            <ContentRenderer body={body} />
          </section>
        ) : mode === 'edit' ? (
          <LiveEditor
            value={body}
            onChange={setBody}
            placeholder={BODY_PLACEHOLDERS[typeKey]}
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
      </div>

      {statusMessage ? (
        <p className="type-caption" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorSlot}
    </Card>
  );
}
