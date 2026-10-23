import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  draftStorageKey,
  useEditorDraft,
} from '../../../src/features/editor/hooks/useEditorDraft.js';

const snapshot = {
  meta: { title: 'Private saved title' },
  body: 'Private saved body',
  savedAt: '2026-10-23T00:00:00Z',
};

it('finds every valid older snapshot only for the exact account and record', () => {
  for (const revision of [2, 4, 6, 7])
    localStorage.setItem(
      draftStorageKey('guide', 'doc', 'actor', revision),
      JSON.stringify(snapshot),
    );
  localStorage.setItem(draftStorageKey('guide', 'doc', 'actor', 3), '{invalid');
  localStorage.setItem(
    draftStorageKey('guide', 'doc_other', 'actor', 1),
    JSON.stringify(snapshot),
  );
  localStorage.setItem(
    draftStorageKey('guide', 'doc', 'actor_guide_doc', 1),
    JSON.stringify(snapshot),
  );
  const { result } = renderHook(() =>
    useEditorDraft(
      'guide',
      'doc',
      { meta: { title: 'Current title' }, body: 'Current body' },
      { actorId: 'actor', version: 6, canEditBody: true },
    ),
  );
  expect(result.current.recoverableDrafts.map((draft) => draft.revision)).toEqual([
    4, 2,
  ]);
});

it('removes recovered body and undo history on permission revocation while keeping its old revision blocked', () => {
  const savedKey = draftStorageKey('guide', 'doc', 'actor', 1);
  localStorage.setItem(savedKey, JSON.stringify(snapshot));
  const { result, rerender } = renderHook(
    ({ canEditBody }) =>
      useEditorDraft(
        'guide',
        'doc',
        {
          meta: { title: 'Current title' },
          body: canEditBody ? 'Current body' : 'Safe projection',
        },
        { actorId: 'actor', version: 2, canEditBody },
      ),
    { initialProps: { canEditBody: true } },
  );
  act(() => result.current.recoverDraft(savedKey));
  act(() => result.current.setBody('Further private edits'));
  rerender({ canEditBody: false });
  expect(result.current.recoverableDrafts).toEqual([]);
  expect(result.current.body).toBe('Safe projection');
  expect(result.current.canUndo).toBe(false);
  expect(result.current.stale).toBe(true);
  expect(localStorage.getItem(savedKey)).toBeNull();
  act(() => result.current.undo());
  act(() => result.current.recoverDraft(savedKey));
  expect(result.current.body).toBe('Safe projection');
  expect(result.current.stale).toBe(true);
});
