import { useCallback, useEffect, useState } from 'react';
import type { EditorMeta } from '../adapters/editorLoad.js';
import type { EditorTypeKey } from '../types.js';

import {
  restoreEditorDraft,
  restoreEditorDraftWithTime,
  type Snapshot,
} from '../editorValidation.js';
type DraftScope = {
  actorId: string | null;
  version: string | number | null;
  canEditBody: boolean;
  /** Meta values from the route that win over a recovered draft (a new quest's `?series`). */
  pinned?: Record<string, unknown>;
};

export function draftStorageKey(
  typeKey: EditorTypeKey,
  recordId: string,
  actorId = 'demo',
  version: string | number | null = 'new',
): string {
  return `cr_draft_v2_${encodeURIComponent(actorId)}_${typeKey}_${encodeURIComponent(recordId)}_${encodeURIComponent(String(version ?? 'new'))}`;
}

function loadDraft(key: string | null): Snapshot | null {
  if (!key) return null;
  try {
    return restoreEditorDraft(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function loadDraftWithTime(
  key: string | null,
): { snapshot: Snapshot; savedAt: string } | null {
  if (!key) return null;
  try {
    return restoreEditorDraftWithTime(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function withPinned(value: Snapshot, pinned: Record<string, unknown> | undefined): Snapshot {
  if (!pinned || Object.keys(pinned).length === 0) return value;
  const differs = Object.entries(pinned).some(([k, v]) => value.meta[k] !== v);
  return differs ? { ...value, meta: { ...value.meta, ...pinned } } : value;
}

type RevisionDraft = { key: string; revision: number; snapshot: Snapshot };

function loadOlderDrafts(
  typeKey: EditorTypeKey,
  recordId: string,
  scope: DraftScope,
): RevisionDraft[] {
  if (!scope.actorId || !scope.canEditBody || typeof scope.version !== 'number')
    return [];
  const prefix = draftStorageKey(typeKey, recordId, scope.actorId, '');
  try {
    const drafts: RevisionDraft[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const revision = Number(key.slice(prefix.length));
      if (
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        revision >= scope.version ||
        key !== draftStorageKey(typeKey, recordId, scope.actorId, revision)
      )
        continue;
      const snapshot = loadDraft(key);
      if (snapshot) drafts.push({ key, revision, snapshot });
    }
    return drafts.sort((a, b) => b.revision - a.revision);
  } catch {
    return [];
  }
}

function persist(key: string | null, value: Snapshot): boolean {
  if (!key) return false;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...value, savedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}
function removeDraft(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}

type DraftState = {
  identity: string;
  key: string | null;
  /** Server signature last loaded; clearDraft advances baseline only, so resync must not use baseline. */
  applied: string;
  baseline: string;
  opened: string;
  values: Snapshot;
  history: Snapshot[];
  cursor: number;
  editableBody: boolean;
  restoredAt: string | null;
  restoredTitle: string;
  restoredPinned: boolean;
};

/** Remount key for a draft host. Version and canEditBody are omitted so dirty/recovered edits stay stale-locked instead of resetting. */
export function editorDraftKey(
  typeKey: EditorTypeKey,
  recordId: string,
  scope: Pick<DraftScope, 'actorId'>,
): string {
  return JSON.stringify([scope.actorId, typeKey, recordId]);
}

export function useEditorDraft(
  typeKey: EditorTypeKey,
  recordId: string,
  initial: { meta: EditorMeta; body: string | null },
  scope: DraftScope = { actorId: 'demo', version: 'new', canEditBody: true },
) {
  const identity = JSON.stringify([scope.actorId, typeKey, recordId]);
  const key = scope.actorId
    ? draftStorageKey(typeKey, recordId, scope.actorId, scope.version)
    : null;
  const server: Snapshot = { meta: initial.meta, body: initial.body ?? '' };
  const signature = JSON.stringify(server);
  const pinned = scope.pinned;
  const pinnedSignature = JSON.stringify(pinned ?? null);
  const remountKey = editorDraftKey(typeKey, recordId, scope);
  const makeState = (): DraftState => {
    const loaded = scope.canEditBody ? loadDraftWithTime(key) : null;
    const saved = loaded?.snapshot;
    const value = saved
      ? withPinned(
          { meta: saved.meta, body: scope.canEditBody ? saved.body : server.body },
          pinned,
        )
      : withPinned(server, pinned);
    return {
      identity,
      key,
      applied: signature,
      baseline: signature,
      /** What the form showed when it opened: the server copy or a recovered draft. */
      opened: JSON.stringify(value),
      values: value,
      history: [value],
      cursor: 0,
      editableBody: scope.canEditBody,
      /** When the recovered draft was saved, if the form opened from one that differs from the server. */
      restoredAt:
        loaded && JSON.stringify(value) !== signature ? loaded.savedAt : null,
      /** The recovered draft's title, so the notice can say which draft came back. */
      restoredTitle:
        saved && typeof saved.meta.title === 'string' ? saved.meta.title.trim() : '',
      /** Route-pinned values (a new quest's `?series`) replaced the recovered draft's own. */
      restoredPinned:
        !!saved &&
        !!pinned &&
        Object.entries(pinned).some(([k, v]) => saved.meta[k] !== v),
    };
  };
  const [state, setState] = useState(makeState);
  const [seenKey, setSeenKey] = useState(remountKey);
  if (seenKey !== remountKey) {
    setSeenKey(remountKey);
    setState(makeState());
  } else if (state.editableBody !== scope.canEditBody) {
    if (!scope.canEditBody) {
      const scrubbed = { ...state.values, body: server.body };
      setState({
        ...state,
        editableBody: false,
        applied: signature,
        baseline: signature,
        opened: signature,
        values: scrubbed,
        history: [scrubbed],
        cursor: 0,
      });
    } else {
      setState(makeState());
    }
  } else if (
    (state.applied !== signature || state.key !== key) &&
    JSON.stringify(state.values) === state.baseline
  ) {
    setState(makeState());
  }
  useEffect(() => {
    if (!scope.canEditBody) removeDraft(state.key);
  }, [scope.canEditBody, state.key]);
  const values = withPinned(
    scope.canEditBody ? state.values : { ...state.values, body: server.body },
    pinned,
  );
  const valuesSignature = JSON.stringify(values);
  const dirty = valuesSignature !== state.baseline;
  // A recovered draft differs from the server but loses nothing on leave until it is edited here.
  const touched = valuesSignature !== state.opened;
  const stale = state.key !== key;
  const change = useCallback(
    (update: (old: Snapshot) => Snapshot) => {
      setState((old) => {
        const base = old.identity === identity ? old : makeState();
        const value = update(withPinned(base.values, pinned));
        const history = [...base.history.slice(0, base.cursor + 1), value].slice(-100);
        const next = {
          ...base,
          values: value,
          history,
          cursor: history.length - 1,
        };
        persist(base.key, value);
        return next;
      });
    },
    [identity, key, signature, scope.canEditBody, pinnedSignature],
  );
  const setMeta: React.Dispatch<React.SetStateAction<EditorMeta>> = useCallback(
    (action) => {
      change((old) => ({
        ...old,
        meta: typeof action === 'function' ? action(old.meta) : action,
      }));
    },
    [change],
  );
  const setBody = useCallback(
    (body: string) => {
      if (scope.canEditBody) change((old) => ({ ...old, body }));
    },
    [change, scope.canEditBody],
  );
  const travel = (delta: number) => {
    setState((old) => {
      if (old.identity !== identity) return old;
      const cursor = Math.max(0, Math.min(old.history.length - 1, old.cursor + delta));
      const value = old.history[cursor];
      persist(old.key, value);
      return { ...old, cursor, values: value };
    });
  };
  const clearDraft = useCallback(() => {
    removeDraft(state.key);
    setState((old) => ({
      ...old,
      baseline: JSON.stringify(old.values),
      opened: JSON.stringify(old.values),
      restoredAt: null,
    }));
  }, [state.key]);
  const resetDraft = () => {
    removeDraft(state.key);
    setState({
      ...makeState(),
      opened: signature,
      values: server,
      history: [server],
      cursor: 0,
      restoredAt: null,
    });
  };
  const recoverableDrafts = loadOlderDrafts(typeKey, recordId, scope);
  return {
    ...values,
    setMeta,
    setBody,
    isDirty: dirty,
    /** Edited since the form opened; leaving now would lose those edits. */
    isTouched: dirty && touched,
    stale,
    /** When the draft this form opened with was saved on this device; null when it opened fresh. */
    restoredAt: state.restoredAt,
    /** Title of the recovered draft; empty when it has none. */
    restoredTitle: state.restoredTitle,
    /** The link's pinned values overrode the recovered draft's (e.g. its series). */
    restoredPinned: state.restoredPinned,
    saveDraft: () => persist(state.key, values),
    recoverableDrafts,
    recoverDraft: (savedKey: string) => {
      const saved = recoverableDrafts.find((draft) => draft.key === savedKey);
      if (!saved) return;
      setState({
        ...makeState(),
        key: saved.key,
        opened: JSON.stringify(saved.snapshot),
        values: saved.snapshot,
        history: [saved.snapshot],
        restoredAt: null,
      });
    },
    clearDraft,
    resetDraft,
    undo: () => travel(-1),
    redo: () => travel(1),
    canUndo: state.cursor > 0,
    canRedo: state.cursor < state.history.length - 1,
  };
}
