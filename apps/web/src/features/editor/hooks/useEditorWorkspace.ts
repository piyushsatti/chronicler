import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useBlocker, useNavigate } from 'react-router-dom';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AppError } from '../../../errors/types.js';
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
import { editorFormInvalid, useEditorPublish } from './useEditorPublish.js';
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

/** Messages from the save guards that a reload resolves (a revoked right or an old revision). */
const RELOAD_MESSAGES = /reload/i;

/**
 * Only a conflict, a stale revision or a revoked permission is fixed by reloading;
 * validation and other refusals are not, so they get no recovery-copy prompt.
 */
export function errorNeedsReload(error: AppError | null): boolean {
  if (!error) return false;
  if (error.kind === 'forbidden' || error.kind === 'unauthorized') return true;
  const cause = error.cause;
  if (cause instanceof TransportError && (cause.code === 'CONFLICT' || cause.status === 409))
    return true;
  return error.kind === 'safe' && RELOAD_MESSAGES.test(error.userMessage);
}

export type EditorConfirm = 'discard' | 'reload';

export function useEditorWorkspace({
  typeKey,
  mode,
  initial,
  paramHint,
  category,
  enabled,
  timeZone,
  actorId = 'demo',
  viewerMemberId = null,
  viewerIsAdmin = false,
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
  /** The signed-in member's id (`memberMe.id`), for options limited to their own records. */
  viewerMemberId?: string | null;
  /** The viewer's roles include admin; widens options such as the series a quest may join. */
  viewerIsAdmin?: boolean;
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
      // A new quest opened from a series link keeps that series over a recovered draft's.
      pinned:
        typeKey === 'quest' &&
        mode === 'new' &&
        typeof initial.meta.arcId === 'string' &&
        initial.meta.arcId !== ''
          ? { arcId: initial.meta.arcId }
          : undefined,
    },
  );
  const { meta, body, setMeta, setBody, isDirty, isTouched, clearDraft } = draft;
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
  const options = useEditorOptions(
    schemaForType(typeKey, meta, schemaAccess, mode),
    enabled,
    viewerMemberId,
    viewerIsAdmin,
  );
  // A new quest saves only a series the picker shows. While the viewer's series are
  // loading or failed to load, a chosen series cannot be checked, so saving waits
  // instead of dropping it. Once loaded, a series that is not among the options
  // (another DM's, from a link or a recovered draft) is not sent, and the Series
  // field says so.
  const seriesOptions = options.series;
  const arcChosen =
    typeKey === 'quest' &&
    mode === 'new' &&
    typeof meta.arcId === 'string' &&
    meta.arcId !== '';
  const seriesWait: 'loading' | 'error' | null = !arcChosen
    ? null
    : seriesOptions.status === 'loading'
      ? 'loading'
      : seriesOptions.status === 'error'
        ? 'error'
        : null;
  const arcShown =
    typeof meta.arcId !== 'string' ||
    meta.arcId === '' ||
    (seriesOptions.status === 'ready' &&
      seriesOptions.items.some((series) => series.id === meta.arcId));
  const publishMeta = arcShown ? meta : { ...meta, arcId: '' };
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
    meta: publishMeta,
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
  // Warn on leave only for edits made in this form; a recovered draft stays saved on the device.
  const blocker = useBlocker(() => isTouched && !leavingAfterSave.current);
  useEffect(() => {
    if (!isTouched) {
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
  }, [isTouched]);
  const [confirming, setConfirming] = useState<EditorConfirm | null>(null);
  const reloadNow = useCallback(async () => {
    draft.resetDraft();
    await onReload();
  }, [draft.resetDraft, onReload]);
  const reloadLatest = useCallback(async () => {
    if (isDirty) {
      setConfirming('reload');
      return;
    }
    await reloadNow();
  }, [isDirty, reloadNow]);
  /** Client-side checks: on failure show the field hints and never call the API. */
  const formInvalid = () => {
    if (!editorFormInvalid(typeKey, mode, publishMeta)) return false;
    setShowPropertyErrors(true);
    publish.reset();
    return true;
  };
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
    /** A new record's draft can be thrown away, clearing its copy on this device. */
    editorMode: mode,
    onDiscardDraft: mode === 'new' ? () => setConfirming('discard') : undefined,
    /** The in-page confirmation for discarding a draft or reloading over local edits. */
    confirming,
    cancelConfirm: () => setConfirming(null),
    acceptConfirm: () => {
      const action = confirming;
      setConfirming(null);
      if (action === 'discard') {
        publish.reset();
        draft.resetDraft();
      } else if (action === 'reload') void reloadNow();
    },
    /** The form opened from a draft saved on this device; "Start fresh" drops it. */
    restoredDraft:
      draft.restoredAt && !draft.stale
        ? {
            savedAt: draft.restoredAt,
            startFresh: () => {
              publish.reset();
              setShowPropertyErrors(false);
              draft.resetDraft();
            },
          }
        : null,
    onSaveDraft: () => {
      if (busy || !admit() || trashed || invalidSession) return;
      if (initial.briefPublished && typeKey !== 'quest') {
        setStatusMessage(
          draft.saveDraft()
            ? 'Draft saved on this device. Publish to update the live page.'
            : 'Draft could not be saved on this device. Keep this page open to preserve your edits.',
        );
      } else if (!formInvalid()) publish.mutate(false);
    },
    onPublish: () => {
      if (busy || formInvalid()) return;
      publish.mutate(true);
    },
    onPreview,
    preview,
    options,
    publishDisabled: busy || !admit() || trashed || invalidSession || seriesWait !== null,
    saveDisabled: busy || !admit() || trashed || invalidSession || seriesWait !== null,
    /** Why saving waits on the Series field, shown next to the save button. */
    seriesNotice:
      seriesWait === 'loading'
        ? 'Loading series…'
        : seriesWait === 'error'
          ? 'Your series could not be loaded. Retry the Series field before creating the quest.'
          : null,
    saveLabel:
      typeKey === 'quest'
        ? mode === 'new'
          ? 'Create quest'
          : 'Save quest'
        : 'Save draft',
    publishLabel:
      typeKey === 'quest'
        ? mode === 'new'
          ? 'Create quest'
          : 'Save quest'
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
    draftRecovery:
      enabled && initial.canEditMetadata && !draft.stale && draft.recoverableDrafts.length
        ? {
            items: draft.recoverableDrafts,
            recover: (key: string) => {
              if (busy || !admit() || trashed) return;
              if (
                isDirty &&
                !window.confirm(
                  'Replace your current edits with this older draft? Copy anything you want to keep first.',
                )
              )
                return;
              draft.recoverDraft(key);
              setStatusMessage(
                'Recovered an older draft. Copy its title and body before discarding local edits and reloading the live page. Publishing this draft is blocked.',
              );
            },
          }
        : undefined,
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
    /** Only conflicts, stale revisions and revoked rights offer the recovery copy and reload. */
    mutationNeedsReload: errorNeedsReload(
      publish.isError
        ? toAppError(publish.error, 'editor:workspace')
        : lifecycle.isError
          ? toAppError(lifecycle.error, 'editor:lifecycle')
          : null,
    ),
    mutationError: publish.isError
      ? toAppError(publish.error, 'editor:workspace')
      : lifecycle.isError
        ? toAppError(lifecycle.error, 'editor:lifecycle')
        : null,
  };
}
export type EditorWorkspaceView = ReturnType<typeof useEditorWorkspace>;
