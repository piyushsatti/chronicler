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
  const makeState = () => {
    const loaded = loadDraftWithTime(key);
    const saved = loaded?.snapshot;
    const value = saved
      ? withPinned(
          { meta: saved.meta, body: scope.canEditBody ? saved.body : server.body },
          pinned,
        )
      : server;
    return {
      identity,
      key,
      baseline: signature,
      /** What the form showed when it opened: the server copy or a recovered draft. */
      opened: JSON.stringify(value),
      values: value,
      history: [value],
      cursor: 0,
      editableBody: scope.canEditBody,
      /** When the recovered draft was saved, if the form opened from one that differs from the server. */
      restoredAt:
        loaded && JSON.stringify(value) !== signature ? loaded.savedAt : (null as string | null),
    };
  };
  const [state, setState] = useState(makeState);
  // Never render a previous account/record's state while waiting for an effect.
  const current = state.identity === identity ? state : makeState();
  const valuesSignature = JSON.stringify(current.values);
  const dirty = valuesSignature !== current.baseline;
  // A recovered draft differs from the server but loses nothing on leave until it is edited here.
  const touched = valuesSignature !== current.opened;
  const stale = current.key !== key;
  const values = scope.canEditBody
    ? current.values
    : { ...current.values, body: server.body };
  useEffect(() => {
    setState((old) => {
      if (old.identity !== identity) return makeState();
      if (old.editableBody && !scope.canEditBody) {
        removeDraft(old.key);
        const value = { meta: old.values.meta, body: server.body };
        return {
          ...makeState(),
          key: old.key,
          opened: JSON.stringify(value),
          values: value,
          history: [value],
        };
      }
      if (old.baseline === signature && old.key === key) return old;
      if (JSON.stringify(old.values) !== old.baseline) {
        // Keep the edits, but a value the route pins (a new quest's series) still wins.
        const value = withPinned(old.values, pinned);
        return value === old.values
          ? old
          : {
              ...old,
              values: value,
              history: [...old.history.slice(0, old.cursor + 1), value],
              cursor: old.cursor + 1,
            };
      }
      return makeState();
    });
  }, [identity, key, signature, pinnedSignature, scope.canEditBody]);
  const change = useCallback(
    (update: (old: Snapshot) => Snapshot) => {
      setState((old) => {
        const base = old.identity === identity ? old : makeState();
        const value = update(base.values);
        const next = {
          ...base,
          values: value,
          history: [...base.history.slice(0, base.cursor + 1), value],
          cursor: base.cursor + 1,
        };
        persist(base.key, value);
        return next;
      });
    },
    [identity, key, signature, scope.canEditBody],
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
    removeDraft(current.key);
    setState((old) => ({
      ...old,
      baseline: JSON.stringify(old.values),
      opened: JSON.stringify(old.values),
      restoredAt: null,
    }));
  }, [current.key]);
  const resetDraft = () => {
    removeDraft(current.key);
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
    restoredAt: current.restoredAt,
    saveDraft: () => persist(current.key, values),
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
    canUndo: current.cursor > 0,
    canRedo: current.cursor < current.history.length - 1,
  };
}
