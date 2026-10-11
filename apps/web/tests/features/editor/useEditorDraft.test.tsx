import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  draftStorageKey,
  useEditorDraft,
} from '../../../src/features/editor/hooks/useEditorDraft.js';

describe('useEditorDraft', () => {
  it('restores the saved local draft and marks it dirty against the loaded record', () => {
    localStorage.setItem(
      draftStorageKey('quest', 'quest-id'),
      JSON.stringify({
        meta: { title: 'Draft title' },
        body: 'Draft body',
        savedAt: '2026-10-10T00:00:00Z',
      }),
    );
    const { result } = renderHook(() =>
      useEditorDraft('quest', 'quest-id', {
        meta: { title: 'Server title' },
        body: 'Server body',
      }),
    );
    expect(result.current.meta.title).toBe('Draft title');
    expect(result.current.body).toBe('Draft body');
    expect(result.current.isDirty).toBe(true);
  });

  it('preserves active edits on same-record refresh even if local storage rejects writes', () => {
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const { result, rerender } = renderHook(
        ({ body }) =>
          useEditorDraft('quest', 'quest-id', {
            meta: { title: 'Server title' },
            body,
          }),
        { initialProps: { body: 'Server body' } },
      );
      act(() => result.current.setBody('Active edit'));
      rerender({ body: 'Fresh server body' });
      expect(result.current.body).toBe('Active edit');
      expect(result.current.isDirty).toBe(true);
    } finally {
      write.mockRestore();
    }
  });

  it('resets to the new record and its own saved draft when the route changes', () => {
    const { result, rerender } = renderHook(
      ({ id }) => useEditorDraft('quest', id, { meta: { title: id }, body: id }),
      { initialProps: { id: 'first' } },
    );
    act(() => result.current.setBody('Unsaved first'));
    rerender({ id: 'second' });
    expect(result.current.body).toBe('second');
    expect(result.current.meta.title).toBe('second');
    expect(result.current.isDirty).toBe(false);
    rerender({ id: 'first' });
    expect(result.current.body).toBe('Unsaved first');
    expect(result.current.isDirty).toBe(true);
  });

  it('clearDraft removes only the selected key and resets its dirty state', () => {
    localStorage.setItem('other-draft', 'keep');
    const { result } = renderHook(() =>
      useEditorDraft('guide', 'doc-id', { meta: { title: 'Guide' }, body: 'Body' }),
    );
    act(() => result.current.setBody('Edited'));
    act(() => result.current.clearDraft());
    expect(localStorage.getItem(draftStorageKey('guide', 'doc-id'))).toBeNull();
    expect(localStorage.getItem('other-draft')).toBe('keep');
    expect(result.current.isDirty).toBe(false);
  });
});
