import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/primitives/Button.js';
import { Tabs } from '../../components/primitives/Tabs.js';
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
import { documentHref } from '../../utils/documentHref.js';
import { relativeDate } from '../../utils/relativeDate.js';
import type { EditorMode } from './types.js';

export type ShellMode = 'edit' | 'read';

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

/** "3 days ago", "yesterday"; anything under a minute (or a skewed clock) reads "a moment ago". */
function draftAge(savedAt: string): string {
  const age = relativeDate(savedAt);
  return age && /ago$|^yesterday$|^last /.test(age) ? age : 'a moment ago';
}

export type EditorShellProps = {
  typeKey: EditorTypeKey;
  /** Creating a new record or editing a saved one. */
  editorMode?: EditorMode;
  /** Why saving is blocked by the Series field (loading or failed options). */
  seriesNotice?: string | null;
  /** The form opened from a draft saved on this device. */
  restoredDraft?: {
    savedAt: string;
    /** The draft's title; empty for an untitled draft. */
    title?: string;
    /** The series came from the link, not from the draft. */
    seriesFromLink?: boolean;
    startFresh: () => void;
  } | null;
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
  /** New records: discard the draft and its copy on this device. Shown while there is a draft. */
  onDiscardDraft?: () => void;
  preview: EditorPreview;
  onPreview: () => void;
  options: EditorFieldOptions;
  statusMessage?: string | null;
  errorSlot?: React.ReactNode;
  showPropertyErrors?: boolean;
  /** Changes on each blocked submit; the error summary then takes focus. */
  errorFocusRequest?: number;
  /** Why the body cannot be submitted (an empty quest description). */
  bodyError?: string | null;
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
  draftRecovery?: {
    items: { key: string; revision: number }[];
    recover: (key: string) => void;
  };
};

export function EditorShell({
  typeKey,
  editorMode = 'edit',
  restoredDraft = null,
  seriesNotice = null,
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
  onDiscardDraft,
  preview,
  onPreview,
  options,
  statusMessage,
  errorSlot,
  showPropertyErrors = false,
  errorFocusRequest = 0,
  bodyError = null,
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
  draftRecovery,
}: EditorShellProps): React.JSX.Element {
  const [mode, setMode] = useState<ShellMode>('edit');
  const schema = schemaForType(typeKey, meta, schemaAccess, editorMode);
  // The page address is assigned on create and never typed by the author: new
  // items hide it, saved items show it once, read-only, under Advanced.
  const visibleSchema = schema.filter((field) => field.key !== 'slug');
  const slug = typeof meta.slug === 'string' ? meta.slug.trim() : '';
  const pageAddress = slug
    ? documentHref({
        kind:
          typeof meta.kind === 'string'
            ? meta.kind
            : typeKey === 'guide' || typeKey === 'ruling'
              ? 'rule'
              : typeKey === 'dm-table'
                ? 'community'
                : typeKey === 'codex'
                  ? 'codex_entry'
                  : typeKey,
        category:
          typeof meta.category === 'string'
            ? meta.category
            : typeKey === 'dm-table'
              ? 'dm_table'
              : typeKey,
        slug,
      })
    : null;

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
      <div
        className="editor-shell"
        data-component="EditorShell"
        data-state={briefMissing ? 'brief-missing' : 'denied'}
        data-type={typeKey}
      >
        <StatePanel
          status={briefMissing ? 'empty' : 'denied'}
          title={briefMissing ? 'This quest has no brief to edit yet' : copy.title}
          emptyMessage="There is no brief available to edit."
          deniedMessage={copy.body}
          action={
            <Link
              className="btn btn--secondary"
              to={typeKey === 'dm-table' ? '/me' : cancelTo}
            >
              {typeKey === 'dm-table'
                ? 'Your page'
                : typeKey === 'quest' && !creating
                  ? 'Back to the quest'
                  : EDITOR_BACK_LABELS[typeKey]}
            </Link>
          }
        />
      </div>
    );
  }

  const historyTools =
    undo || redo ? (
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
    ) : null;
  const actions = (
    <div className={`row ${styles.actions}`} aria-label="Document actions">
      {typeKey !== 'quest' ? (
        <Button
          type="button"
          variant="primary"
          disabled={publishDisabled}
          onClick={onPublish}
        >
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
      {onDiscardDraft && isDirty ? (
        <Button type="button" variant="ghost" onClick={onDiscardDraft}>
          Discard draft
        </Button>
      ) : null}
      <Link className="btn btn--ghost" to={cancelTo}>
        Cancel
      </Link>
      {seriesNotice ? (
        <span className="type-caption" role="status">
          {seriesNotice}
        </span>
      ) : null}
      {typeKey === 'quest' && editorMode === 'new' ? (
        <span className="type-caption">
          Creating the quest posts it to the community Discord.
        </span>
      ) : null}
    </div>
  );
  const unavailableBody = (
    <section className="stack" aria-label="Body editing unavailable">
      <p className="type-caption">
        Body editing is currently unavailable. Metadata changes preserve the source
        body.
      </p>
      <ContentRenderer body={body} />
    </section>
  );
  const previewBody = (
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
  );

  return (
    <Card className="editor-shell stack" data-component="EditorShell" data-mode={mode} data-type={typeKey}>
      {draftRecovery ? (
        <section className="stack" aria-label="Saved drafts from earlier revisions">
          <h2 className="type-heading">Saved drafts from earlier revisions</h2>
          <p className="type-caption">
            The live page has changed. Recover a saved draft to copy its title and
            body. Publishing stays blocked until you reload the live page.
          </p>
          <div className="row" data-wrap="1" data-gap="2">
            {draftRecovery.items.map((draft) => (
              <Button
                key={draft.key}
                type="button"
                variant="secondary"
                onClick={() => draftRecovery.recover(draft.key)}
              >
                Recover saved draft from revision {draft.revision}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      {restoredDraft ? (
        <section
          className="row"
          data-wrap="1"
          data-gap="2"
          role="status"
          aria-label="Restored draft"
        >
          <p className="type-caption">
            {restoredDraft.title
              ? `Restored your unsaved draft “${restoredDraft.title}” from `
              : 'Restored an untitled draft from '}
            {draftAge(restoredDraft.savedAt)}.
            {restoredDraft.seriesFromLink
              ? ' The series was set from the link you opened.'
              : null}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={restoredDraft.startFresh}
          >
            Start fresh
          </Button>
        </section>
      ) : null}
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
          focusRequest={errorFocusRequest}
          revealFilled={restoredDraft !== null}
          createMode={editorMode === 'new'}
          extraErrors={
            bodyError ? [{ key: 'body', label: 'Description', message: bodyError }] : []
          }
          slugLocked={slugLocked || typeKey !== 'quest'}
          options={options}
        />
      </fieldset>
      {typeKey === 'quest' && canEditBody ? (
        <div
          className="pf-row"
          data-field="body"
          data-err={showPropertyErrors && bodyError ? 1 : 0}
        >
          <div className="pf-label">
            Description
            <span className="pf-hint">Required</span>
          </div>
          {showPropertyErrors && bodyError ? (
            <div className="pf-val">
              <div className="pf-err">{bodyError}</div>
            </div>
          ) : null}
        </div>
      ) : null}
      {slugLocked && pageAddress ? <PageAddress address={pageAddress} /> : null}
      <Tabs
        aria-label="Editor mode"
        value={mode}
        onValueChange={(value) => {
          if (value === 'read') onPreview();
          if (value === 'read' || value === 'edit') setMode(value);
        }}
        items={[
          {
            id: 'edit',
            label: 'Write',
            panel: canEditBody ? (
              <LiveEditor
                value={body}
                onChange={setBody}
                placeholder={BODY_PLACEHOLDERS[typeKey]}
                entityIndex={entityIndex}
                toolbarStart={historyTools}
                toolbarEnd={actions}
              />
            ) : (
              <div className="stack">
                <div className={`row ${styles.toolbar}`} data-wrap="1">
                  {historyTools}
                  {actions}
                </div>
                {unavailableBody}
              </div>
            ),
          },
          {
            id: 'read',
            label: 'Preview',
            panel: (
              <div className="stack">
                <div className={`row ${styles.toolbar}`} data-wrap="1">
                  {historyTools}
                  {actions}
                </div>
                {canEditBody ? previewBody : unavailableBody}
              </div>
            ),
          },
        ]}
      />
      {isDirty ? (
        <p className="type-caption" role="status">
          Unsaved draft
        </p>
      ) : null}
      {statusMessage ? (
        <p className="type-caption" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorSlot}
    </Card>
  );
}
