import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useBlocker, useNavigate } from 'react-router-dom';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import {
  changeDocumentLifecycle,
  type LifecycleAction,
} from '../adapters/editorLifecycle.js';
import { schemaForType, type SchemaAccess } from '../editorSchemas.js';
import { isEditorInstant } from '../editorDateTime.js';
import type { EditorMode, EditorTypeKey } from '../types.js';
import { useEditorDraft } from './useEditorDraft.js';
import { useEditorSummaryLinks } from './useEditorSummaryLinks.js';
import { useEditorAudience } from './useEditorAudience.js';
import { useEditorHistory } from './useEditorHistory.js';
import { useEditorOptions } from './useEditorOptions.js';
import { useEditorPreview } from './useEditorPreview.js';
import { useEditorPublish } from './useEditorPublish.js';
import { useEntityLinkIndex } from './useEntityLinkIndex.js';

function editorEditPath(typeKey: EditorTypeKey, id: string): string {
  if (typeKey === 'quest') return `/quests/${encodeURIComponent(id)}/edit`;
  if (typeKey === 'dm-table') return `/editor/dm-table/${encodeURIComponent(id)}/edit`;
  if (typeKey === 'guide' || typeKey === 'ruling')
    return `/rules/${typeKey}s/${encodeURIComponent(id)}/edit`;
  return `/${typeKey === 'codex' ? 'codex' : 'summaries'}/${encodeURIComponent(id)}/edit`;
}
export function editorCancelPath(
  typeKey: EditorTypeKey,
  mode: EditorMode,
  id?: string,
): string {
  switch (typeKey) {
    case 'quest':
      return mode === 'edit' && id ? `/quests/${encodeURIComponent(id)}` : '/quests';
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

const NO_SCHEMA_ACCESS: SchemaAccess = {};

export function useEditorWorkspace({
  typeKey,
  mode,
  initial,
  paramHint,
  category,
  enabled,
  timeZone,
  actorId = 'demo',
  schemaAccess = NO_SCHEMA_ACCESS,
  sessionIsCurrent = () => true,
  onReload = async () => {},
}: {
  typeKey: EditorTypeKey;
  mode: EditorMode;
  initial: EditorLoadResult;
  paramHint?: string;
  category?: string;
  enabled: boolean;
  timeZone: string;
  actorId?: string | null;
  schemaAccess?: SchemaAccess;
  sessionIsCurrent?: () => boolean;
  onReload?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const entityQuery = useEntityLinkIndex(enabled);
  const draft = useEditorDraft(
    typeKey,
    initial.recordId,
    { meta: initial.meta, body: initial.body },
    {
      actorId,
      version: typeKey === 'quest' ? initial.updatedAt : initial.documentVersion,
      canEditBody: enabled && initial.canEditBody,
    },
  );
  const { meta, body, setMeta, setBody, isDirty, clearDraft } = draft;
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPropertyErrors, setShowPropertyErrors] = useState(false);
  const recordScope = JSON.stringify([actorId, typeKey, initial.recordId]);
  const summaryLinks = useEditorSummaryLinks({
    initial,
    meta,
    setMeta,
    enabled: enabled && !draft.stale,
    scopeKey: recordScope,
  });
  const [trashedRecord, setTrashedRecord] = useState<string | null>(null);
  const trashed = trashedRecord === recordScope;
  const audienceScope = JSON.stringify([recordScope, initial.documentVersion]);
  const initialAudience = {
    visibility: initial.visibility,
    policyMode: initial.policy === null ? ('visibility' as const) : ('custom' as const),
    policy: initial.policy?.join(', ') ?? '',
    readerIds: initial.readerIds.join(', '),
  };
  const [audienceDraft, setAudienceDraft] = useState({
    scope: audienceScope,
    ...initialAudience,
  });
  const currentAudience =
    audienceDraft.scope === audienceScope ? audienceDraft : initialAudience;
  const { visibility, policyMode, policy, readerIds } = currentAudience;
  const setVisibility = (value: string) =>
    setAudienceDraft({ scope: audienceScope, ...currentAudience, visibility: value });
  const setPolicyMode = (value: 'visibility' | 'custom') =>
    setAudienceDraft({ scope: audienceScope, ...currentAudience, policyMode: value });
  const setPolicy = (value: string) =>
    setAudienceDraft({ scope: audienceScope, ...currentAudience, policy: value });
  const setReaderIds = (value: string) =>
    setAudienceDraft({ scope: audienceScope, ...currentAudience, readerIds: value });
  const audience = useEditorAudience({
    readerIds,
    setReaderIds,
    enabled: enabled && initial.canEditMetadata && typeKey !== 'quest',
    scopeKey: recordScope,
  });
  const options = useEditorOptions(schemaForType(typeKey, meta, schemaAccess), enabled);
  const { preview, onPreview } = useEditorPreview(body);
  const history = useEditorHistory(
    initial.documentId,
    enabled && initial.canEditMetadata && typeKey !== 'quest',
  );
  const admit = () =>
    typeKey !== 'demo' &&
    enabled &&
    initial.canEditMetadata &&
    !draft.stale &&
    sessionIsCurrent();
  const leavingAfterSave = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const publish = useEditorPublish({
    typeKey,
    mode,
    initial,
    meta,
    body,
    category,
    admit,
    scopeKey: `${actorId ?? 'anonymous'}:${typeKey}:${initial.recordId}`,
    onInvalidTitle: () => setShowPropertyErrors(true),
    onSuccess: (result, published) => {
      if (!sessionIsCurrent()) return;
      clearDraft();
      leavingAfterSave.current = true;
      setStatusMessage(
        result.warning ?? (published ? 'Published.' : 'Saved on the server.'),
      );
      if (published || typeKey === 'quest') navigate(result.redirectPath);
      else if (mode === 'new')
        navigate(editorEditPath(typeKey, result.id), { replace: true });
      else void onReload();
    },
  });
  const lifecycleKeys = useRef(new Map<string, string>());
  const lifecycle = useMutation({
    mutationFn: async (command: LifecycleAction) => {
      if (
        !admit() ||
        typeKey === 'quest' ||
        !initial.documentId ||
        initial.documentVersion === null
      )
        throw safeAppError(
          'Reload to check your current permissions.',
          'editor:lifecycle',
        );
      if (isDirty)
        throw safeAppError(
          'Save or discard your edits before changing document state.',
          'editor:lifecycle',
        );
      const fingerprint = JSON.stringify([
        initial.documentId,
        initial.documentVersion,
        command,
      ]);
      let idempotencyKey = lifecycleKeys.current.get(fingerprint);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        lifecycleKeys.current.set(fingerprint, idempotencyKey);
      }
      await changeDocumentLifecycle(
        initial.documentId,
        initial.documentVersion,
        command,
        idempotencyKey,
      );
      return { command, recordId: initial.recordId, actorId };
    },
    onSuccess: ({ command, recordId, actorId: originalActor }) => {
      if (
        !mounted.current ||
        recordId !== initial.recordId ||
        originalActor !== actorId ||
        !sessionIsCurrent()
      )
        return;
      setTrashedRecord(command.action === 'delete' ? recordScope : null);
      setStatusMessage(
        command.action === 'delete'
          ? 'Moved to trash. Restore is available here.'
          : 'Document updated.',
      );
      if (command.action !== 'delete') void onReload();
      void history.refetch();
    },
  });
  const busy = publish.isPending || lifecycle.isPending;
  const invalidSession = typeKey === 'quest' && !isEditorInstant(meta.scheduledAt);
  const blocker = useBlocker(() => isDirty && !leavingAfterSave.current);
  useEffect(() => {
    if (!isDirty) {
      leavingAfterSave.current = false;
      return;
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!leavingAfterSave.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);
  const reloadLatest = useCallback(async () => {
    if (
      isDirty &&
      !window.confirm('Discard these local edits and load the latest server revision?')
    )
      return;
    draft.resetDraft();
    await onReload();
  }, [isDirty, draft.resetDraft, onReload]);
  return {
    typeKey,
    timeZone,
    mode,
    recordId: initial.recordId,
    meta,
    body,
    setMeta,
    setBody,
    isDirty,
    onSaveDraft: () => {
      if (!busy) publish.mutate(false);
    },
    onPublish: () => {
      if (!busy) publish.mutate(true);
    },
    onPreview,
    preview,
    options,
    publishDisabled: busy || !admit() || trashed || invalidSession,
    saveDisabled: busy || !admit() || trashed || invalidSession,
    saveLabel:
      typeKey === 'quest'
        ? mode === 'new'
          ? 'Create quest'
          : 'Save quest'
        : initial.briefPublished
          ? 'Save changes'
          : 'Save draft',
    publishLabel:
      typeKey === 'quest'
        ? mode === 'new'
          ? 'Create quest'
          : 'Save quest'
        : initial.briefPublished
          ? 'Save and view'
          : 'Publish',
    // The server grants neither right, so the editor would be inert: show a denial.
    // A quest without a loadable brief is inert for everyone, admins included.
    denied: mode === 'edit' && !initial.canEditMetadata && !initial.canEditBody,
    briefMissing: mode === 'edit' && initial.briefMissing === true,
    /** The page hook sets `create` when the account may not start this type. */
    deniedAction: 'edit' as 'edit' | 'create',
    schemaAccess,
    canEditBody: !busy && enabled && initial.canEditBody && !trashed,
    canEditMetadata: !busy && enabled && initial.canEditMetadata && !trashed,
    cancelTo: editorCancelPath(
      typeKey,
      mode,
      paramHint ?? initial.redirectHint ?? undefined,
    ),
    statusMessage,
    showPropertyErrors,
    slugLocked: mode === 'edit',
    stale: draft.stale,
    onReload: reloadLatest,
    navigationBlocked: blocker.state === 'blocked',
    stay: () => {
      if (blocker.state === 'blocked') blocker.reset();
    },
    leave: () => {
      if (blocker.state === 'blocked') blocker.proceed();
    },
    undo: draft.undo,
    redo: draft.redo,
    canUndo: draft.canUndo,
    canRedo: draft.canRedo,
    history,
    summaryLinks,
    showLifecycle:
      typeKey !== 'quest' && initial.documentId !== null && initial.canEditMetadata,
    lifecycleDisabled: busy || isDirty || !admit(),
    trashed,
    published: initial.briefPublished,
    onLifecycle: (command: LifecycleAction) => lifecycle.mutate(command),
    audience,
    saveAudience: () => {
      const nextPolicy =
        policyMode === 'visibility'
          ? null
          : policy
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
      lifecycle.mutate({
        action: 'audience',
        visibility,
        ...(JSON.stringify(nextPolicy) !== JSON.stringify(initial.policy)
          ? { policy: nextPolicy }
          : {}),
        readerIds: readerIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      });
    },
    visibility,
    setVisibility,
    policyMode,
    setPolicyMode,
    policy,
    setPolicy,
    readerIds,
    setReaderIds,
    entityIndex: entityQuery.data ?? [],
    entityIndexError: entityQuery.isError
      ? toAppError(entityQuery.error, 'editor:entity-index')
      : null,
    mutationError: publish.isError
      ? toAppError(publish.error, 'editor:workspace')
      : lifecycle.isError
        ? toAppError(lifecycle.error, 'editor:lifecycle')
        : null,
  };
}
export type EditorWorkspaceView = ReturnType<typeof useEditorWorkspace>;
