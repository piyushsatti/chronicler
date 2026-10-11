import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toAppError } from '../../../errors/toAppError.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import { schemaForType } from '../editorSchemas.js';
import type { EditorMode, EditorTypeKey } from '../types.js';
import { useEditorDraft } from './useEditorDraft.js';
import { useEditorOptions } from './useEditorOptions.js';
import { useEditorPreview } from './useEditorPreview.js';
import { useEditorPublish } from './useEditorPublish.js';
import { useEntityLinkIndex } from './useEntityLinkIndex.js';

function cancelPath(typeKey: EditorTypeKey, mode: EditorMode, id?: string): string {
  switch (typeKey) {
    case 'quest':
      return mode === 'edit' && id ? `/quests/${id}` : '/quests';
    case 'guide':
    case 'ruling':
      return '/rules';
    case 'summary':
      return '/chronicles';
    case 'codex':
      return '/codex';
    case 'dm-table':
      return '/dms';
    default:
      return '/';
  }
}

export function useEditorWorkspace({
  typeKey,
  mode,
  initial,
  paramHint,
  category,
  enabled,
}: {
  typeKey: EditorTypeKey;
  mode: EditorMode;
  initial: EditorLoadResult;
  paramHint?: string;
  category?: string;
  enabled: boolean;
}) {
  const navigate = useNavigate();
  const entityQuery = useEntityLinkIndex(enabled);
  const draftKey = mode === 'edit' ? initial.recordId : 'new';
  const { meta, body, setMeta, setBody, isDirty, saveDraft, clearDraft } =
    useEditorDraft(typeKey, draftKey, { meta: initial.meta, body: initial.body });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPropertyErrors, setShowPropertyErrors] = useState(false);
  const options = useEditorOptions(schemaForType(typeKey, meta), enabled);
  const { preview, onPreview } = useEditorPreview(body);
  const onSaveDraft = useCallback(() => {
    saveDraft();
    setStatusMessage('Draft saved locally.');
  }, [saveDraft]);
  const publish = useEditorPublish({
    typeKey,
    mode,
    initial,
    meta,
    body,
    category,
    onInvalidTitle: () => setShowPropertyErrors(true),
    onSuccess: (result) => {
      clearDraft();
      setStatusMessage(result.warning ? `Published. ${result.warning}` : 'Published.');
      navigate(result.redirectPath);
    },
  });
  return {
    typeKey,
    mode,
    recordId: initial.recordId,
    meta,
    body,
    setMeta,
    setBody,
    isDirty,
    onSaveDraft,
    onPublish: () => {
      onPreview();
      publish.mutate();
    },
    onPreview,
    preview,
    options,
    publishDisabled: publish.isPending || !String(meta.title ?? '').trim(),
    saveDisabled: false,
    cancelTo: cancelPath(typeKey, mode, paramHint ?? initial.redirectHint ?? undefined),
    statusMessage,
    showPropertyErrors,
    slugLocked: mode === 'edit',
    entityIndex: entityQuery.data ?? [],
    entityIndexError: entityQuery.isError
      ? toAppError(entityQuery.error, 'editor:entity-index')
      : null,
    mutationError: publish.isError
      ? toAppError(publish.error, 'editor:workspace')
      : null,
  };
}
export type EditorWorkspaceView = ReturnType<typeof useEditorWorkspace>;
