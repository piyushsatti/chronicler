import { StatePanel } from '../../components/foundation/StatePanel.js';
import { PageHeader } from '../../components/primitives/PageHeader.js';
import { EditorShell } from './EditorShell.js';
import { EditorSummaryLinks } from './EditorSummaryLinks.js';
import { EditorDocumentControls } from './EditorDocumentControls.js';
import styles from './editor.module.css';
import type { EditorWorkspaceView } from './hooks/useEditorWorkspace.js';
import { Link } from 'react-router-dom';
import { useMe } from '../../hooks/useMe.js';
import { DmApprovalNotice } from '../../components/domain/DmApprovalNotice.js';
import { QUEST_DM_APPROVAL_ERROR } from './editorConstants.js';

const editorLabels = {
  quest: 'quest',
  codex: 'Codex entry',
  summary: 'session summary',
  guide: 'guide',
  ruling: 'ruling',
  'dm-table': 'DM table',
  demo: 'editor example',
} as const;

const PARENT_LABELS = {
  quest: 'Quests',
  codex: 'Codex',
  summary: 'Chronicles',
  guide: 'Rules',
  ruling: 'Rules',
  'dm-table': 'DMs',
  demo: 'Home',
} as const;

/** The page the editor returns to, named for what it is. Editing a quest
 * returns to that quest, so it carries the quest's title. */
function backFor(
  typeKey: keyof typeof PARENT_LABELS,
  to: string,
  title: string,
  slug?: unknown,
): { to: string; label: string } {
  const quest = typeKey === 'quest' && to !== '/quests';
  // A saved Codex entry returns to that entry, named for it.
  if (typeKey === 'codex' && typeof slug === 'string' && slug.trim())
    return {
      to: `/codex/${encodeURIComponent(slug.trim())}`,
      label: title.trim() || 'Entry',
    };
  return { to, label: quest ? title.trim() || 'Quest' : PARENT_LABELS[typeKey] };
}

/** "New Lore entry" when a Codex category is already chosen; otherwise the plain noun. */
function headerTitle(view: EditorWorkspaceView): string {
  const verb = view.mode === 'edit' ? 'Edit' : 'New';
  const category =
    typeof view.meta.category === 'string' ? view.meta.category.trim() : '';
  if (view.typeKey === 'codex' && view.mode === 'new' && category)
    return `New ${category} entry`;
  return `${verb} ${editorLabels[view.typeKey]}`;
}

function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function DmProfileShortcut(): React.JSX.Element | null {
  const me = useMe().data;
  if (!me) return null;
  return (
    <p className="type-caption">
      Your table describes how you run games.{' '}
      <Link className="type-link" to={`/dms/@${encodeURIComponent(me.handle)}?edit=profile`}>
        Edit your DM profile
      </Link>{' '}
      to change your tagline, availability or whether you accept players.
    </p>
  );
}

/** The way out of a refused quest create: the DM profile editor. */
function DmProfileLink(): React.JSX.Element | null {
  const me = useMe().data;
  if (!me) return null;
  return (
    <Link
      className="btn btn--secondary"
      to={`/dms/@${encodeURIComponent(me.handle)}?edit=profile`}
    >
      Open your DM profile
    </Link>
  );
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
        <PageHeader
          back={backFor(view.typeKey, view.cancelTo, view.meta.title)}
          title={
            view.deniedAction === 'create'
              ? `New ${editorLabels[view.typeKey]}`
              : view.meta.title.trim() || sentence(editorLabels[view.typeKey])
          }
        />
      ) : (
        <PageHeader
          back={backFor(view.typeKey, view.cancelTo, view.meta.title, view.meta.slug)}
          title={headerTitle(view)}
        />
      )}
      {view.typeKey === 'quest' && view.mode === 'new' ? <DmApprovalNotice /> : null}
      {!view.denied ? (
        <>
          {view.published && view.typeKey !== 'quest' ? (
            <p className="type-caption">
              Drafts for published pages are saved on this device. Publish updates the
              live page.
            </p>
          ) : view.typeKey === 'summary' ? (
            <p className="type-caption">
              Drafts stay private until you publish. Published summaries are public
              unless you change their readers.
            </p>
          ) : null}
          {view.typeKey === 'dm-table' ? <DmProfileShortcut /> : null}
        </>
      ) : null}
      <EditorShell
        {...view}
        errorSlot={
          <>
            {view.mutationError ? (
              <StatePanel
                status="error"
                error={view.mutationError}
                action={
                  view.mutationError.debugId === QUEST_DM_APPROVAL_ERROR ? (
                    <DmProfileLink />
                  ) : undefined
                }
              />
            ) : null}
            {view.entityIndexError ? (
              <StatePanel status="error" error={view.entityIndexError} />
            ) : null}
          </>
        }
      />
      {!view.denied ? (
        <EditorSummaryLinks view={view.summaryLinks} disabled={!view.canEditMetadata} />
      ) : null}
      <EditorDocumentControls view={view} />
    </div>
  );
}
