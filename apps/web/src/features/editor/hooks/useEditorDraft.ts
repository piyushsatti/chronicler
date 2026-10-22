import { useCallback, useEffect, useState } from 'react';
import type { EditorMeta } from '../adapters/editorLoad.js';
import type { EditorTypeKey } from '../types.js';

import { restoreEditorDraft, type Snapshot } from '../editorValidation.js';
type DraftScope = {
  actorId: string | null;
  version: string | number | null;
  canEditBody: boolean;
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
function persist(key: string | null, value: Snapshot): void {
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...value, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* Crash recovery is best effort. */
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
  const makeState = () => {
    const saved = loadDraft(key);
    const value = saved
      ? { meta: saved.meta, body: scope.canEditBody ? saved.body : server.body }
      : server;
    return {
      identity,
      key,
      baseline: signature,
      values: value,
      history: [value],
      cursor: 0,
      editableBody: scope.canEditBody,
    };
  };
  const [state, setState] = useState(makeState);
  // Never render a previous account/record's state while waiting for an effect.
  const current = state.identity === identity ? state : makeState();
  const dirty = JSON.stringify(current.values) !== current.baseline;
  const stale = current.key !== key && dirty;
  const values = scope.canEditBody
    ? current.values
    : { ...current.values, body: server.body };
  useEffect(() => {
    setState((old) => {
      if (old.identity !== identity) return makeState();
      if (old.editableBody && !scope.canEditBody) {
        removeDraft(old.key);
        return { ...makeState(), values: { meta: old.values.meta, body: server.body } };
      }
      if (old.baseline === signature && old.key === key) return old;
      if (JSON.stringify(old.values) !== old.baseline) return old;
      return makeState();
    });
  }, [identity, key, signature, scope.canEditBody]);
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
    setState((old) => ({ ...old, baseline: JSON.stringify(old.values) }));
  }, [current.key]);
  const resetDraft = () => {
    removeDraft(current.key);
    setState({ ...makeState(), values: server, history: [server], cursor: 0 });
  };
  return {
    ...values,
    setMeta,
    setBody,
    isDirty: dirty,
    stale,
    saveDraft: () => persist(current.key, values),
    clearDraft,
    resetDraft,
    undo: () => travel(-1),
    redo: () => travel(1),
    canUndo: current.cursor > 0,
    canRedo: current.cursor < current.history.length - 1,
  };
}
