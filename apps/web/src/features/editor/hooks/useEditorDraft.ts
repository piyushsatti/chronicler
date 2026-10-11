import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorMeta } from '../adapters/editorLoad.js';
import type { EditorTypeKey } from '../types.js';

export function draftStorageKey(typeKey: EditorTypeKey, recordId: string): string {
  return `cr_draft_${typeKey}_${recordId || 'new'}`;
}

type StoredDraft = { meta: EditorMeta; body: string; savedAt: string };

function loadDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function saveDraftToStorage(key: string, meta: EditorMeta, body: string): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        meta,
        body,
        savedAt: new Date().toISOString(),
      } satisfies StoredDraft),
    );
  } catch {
    /* ignore quota */
  }
}

export function useEditorDraft(
  typeKey: EditorTypeKey,
  recordId: string,
  initial: { meta: EditorMeta; body: string },
): {
  meta: EditorMeta;
  body: string;
  setMeta: React.Dispatch<React.SetStateAction<EditorMeta>>;
  setBody: (v: string) => void;
  isDirty: boolean;
  saveDraft: () => void;
  clearDraft: () => void;
} {
  const key = draftStorageKey(typeKey, recordId);
  const initialSignature = JSON.stringify(initial);
  const baseline = useRef(initialSignature);

  const [meta, setMetaState] = useState<EditorMeta>(
    () => loadDraft(key)?.meta ?? initial.meta,
  );
  const [body, setBodyState] = useState(() => loadDraft(key)?.body ?? initial.body);
  const [isDirty, setIsDirty] = useState(
    () => JSON.stringify({ meta, body }) !== baseline.current,
  );

  const currentKey = useRef(key);
  const dirty = useRef(isDirty);
  const markDirty = useCallback((m: EditorMeta, b: string) => {
    dirty.current = JSON.stringify({ meta: m, body: b }) !== baseline.current;
    setIsDirty(dirty.current);
  }, []);

  useEffect(() => {
    // A record refetch must not replace active edits, including when storage is unavailable.
    if (currentKey.current === key && dirty.current) return;
    currentKey.current = key;
    baseline.current = JSON.stringify({ meta: initial.meta, body: initial.body });
    const d = loadDraft(key);
    const nextMeta = d?.meta ?? initial.meta;
    const nextBody = d?.body ?? initial.body;
    setMetaState(nextMeta);
    setBodyState(nextBody);
    markDirty(nextMeta, nextBody);
  }, [key, initialSignature, markDirty]);

  const persist = useCallback(
    (m: EditorMeta, b: string) => {
      saveDraftToStorage(key, m, b);
    },
    [key],
  );

  const setMeta: React.Dispatch<React.SetStateAction<EditorMeta>> = useCallback(
    (action) => {
      setMetaState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        persist(next, body);
        markDirty(next, body);
        return next;
      });
    },
    [body, persist, markDirty],
  );

  const setBody = useCallback(
    (v: string) => {
      setBodyState(v);
      persist(meta, v);
      markDirty(meta, v);
    },
    [meta, persist, markDirty],
  );

  const saveDraft = useCallback(() => {
    persist(meta, body);
  }, [persist, meta, body]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    dirty.current = false;
    setIsDirty(false);
  }, [key]);

  return { meta, body, setMeta, setBody, isDirty, saveDraft, clearDraft };
}
