import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  draftStorageKey,
  useEditorDraft,
} from '../../../src/features/editor/hooks/useEditorDraft.js';

describe('useEditorDraft', () => {
  it('bounds undo history and keeps cursor correct after branching', () => {
    const { result } = renderHook(() =>
      useEditorDraft('guide', 'bounded-history', {
        meta: { title: 'Original' },
        body: '0',
      }),
    );
    for (let index = 1; index <= 120; index++)
      act(() => result.current.setBody(String(index)));
    for (let index = 0; index < 120; index++) act(() => result.current.undo());
    expect(result.current.body).toBe('21');
    expect(result.current.canUndo).toBe(false);
    for (let index = 0; index < 120; index++) act(() => result.current.redo());
    expect(result.current.body).toBe('120');
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    act(() => result.current.undo());
    act(() => result.current.setBody('Branched'));
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.body).toBe('118');
    act(() => result.current.redo());
    expect(result.current.body).toBe('Branched');
    expect(
      JSON.parse(
        localStorage.getItem(draftStorageKey('guide', 'bounded-history')) ?? '{}',
      ).body,
    ).toBe('Branched');
  });

  it('keeps typed body when route-pinned metadata changes and persists the pin', () => {
    const { result, rerender } = renderHook(
      ({ series }) =>
        useEditorDraft(
          'quest',
          'bounded-pinned',
          {
            meta: { title: 'Original' },
            body: `Source ${series}`,
          },
          { actorId: 'demo', version: 'new', canEditBody: true, pinned: { series } },
        ),
      { initialProps: { series: '0' } },
    );
    act(() => result.current.setBody('Edited'));
    rerender({ series: '99' });
    expect(result.current.body).toBe('Edited');
    expect(result.current.meta.series).toBe('99');
    act(() => result.current.setBody('Edited again'));
    expect(
      JSON.parse(
        localStorage.getItem(
          draftStorageKey('quest', 'bounded-pinned', 'demo', 'new'),
        ) ?? '{}',
      ).meta.series,
    ).toBe('99');
  });

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

  it('keeps typed body across an unchanged refetch of the same record', () => {
    const { result, rerender } = renderHook(
      ({ body }) =>
        useEditorDraft('guide', 'same-record', {
          meta: { title: 'Guide' },
          body,
        }),
      { initialProps: { body: 'Body' } },
    );
    act(() => result.current.setBody('Typed'));
    rerender({ body: 'Body' });
    expect(result.current.body).toBe('Typed');
    expect(result.current.isDirty).toBe(true);
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

  it('clearDraft removes only the selected key and keeps accepted values until reload', () => {
    localStorage.setItem('other-draft', 'keep');
    const { result, rerender } = renderHook(
      ({ body }) =>
        useEditorDraft('guide', 'doc-id', { meta: { title: 'Guide' }, body }),
      { initialProps: { body: 'Body' } },
    );
    act(() => result.current.setBody('Edited'));
    act(() => result.current.clearDraft());
    rerender({ body: 'Body' });
    expect(localStorage.getItem(draftStorageKey('guide', 'doc-id'))).toBeNull();
    expect(localStorage.getItem('other-draft')).toBe('keep');
    expect(result.current.body).toBe('Edited');
    expect(result.current.isDirty).toBe(false);
  });
});

it('never restores a previous account or revision into the current draft', () => {
  const { result, rerender } = renderHook(
    ({ actorId, version }) =>
      useEditorDraft(
        'guide',
        'same-doc',
        { meta: { title: 'Current title' }, body: 'Current source' },
        { actorId, version, canEditBody: true },
      ),
    { initialProps: { actorId: 'first', version: 1 } },
  );
  act(() => result.current.setBody('PRIVATE FIRST ACCOUNT'));
  rerender({ actorId: 'second', version: 1 });
  expect(result.current.body).toBe('Current source');
  expect(result.current.isDirty).toBe(false);
  rerender({ actorId: 'first', version: 2 });
  expect(result.current.body).toBe('Current source');
  expect(result.current.isDirty).toBe(false);
});
it('keeps active edits but marks them stale when the server version advances', () => {
  const { result, rerender } = renderHook(
    ({ version }) =>
      useEditorDraft(
        'guide',
        'doc',
        { meta: { title: 'Current' }, body: `Source ${version}` },
        { actorId: 'actor', version, canEditBody: true },
      ),
    { initialProps: { version: 1 } },
  );
  act(() => result.current.setBody('Local changes'));
  rerender({ version: 2 });
  expect(result.current.body).toBe('Local changes');
  expect(result.current.stale).toBe(true);
});
it('drops cached body and undo history when body permission is revoked', () => {
  const { result, rerender } = renderHook(
    ({ canEditBody }) =>
      useEditorDraft(
        'guide',
        'doc',
        {
          meta: { title: 'Current' },
          body: canEditBody ? 'Complete body' : 'Safe projection',
        },
        { actorId: 'actor', version: 1, canEditBody },
      ),
    { initialProps: { canEditBody: true } },
  );
  act(() => result.current.setBody('PRIVATE LOCAL CONTENT'));
  rerender({ canEditBody: false });
  expect(result.current.body).toBe('Safe projection');
  expect(result.current.isDirty).toBe(false);
  expect(result.current.isTouched).toBe(false);
  expect(localStorage.getItem(draftStorageKey('guide', 'doc', 'actor', 1))).toBeNull();
  act(() => result.current.undo());
  expect(result.current.body).toBe('Safe projection');
});
it('undoes and redoes body and metadata as one document history', () => {
  const { result } = renderHook(() =>
    useEditorDraft('guide', 'history-doc', {
      meta: { title: 'Original' },
      body: 'Body',
    }),
  );
  act(() => result.current.setMeta((old) => ({ ...old, title: 'Renamed' })));
  act(() => result.current.setBody('New body'));
  act(() => result.current.undo());
  expect(result.current.meta.title).toBe('Renamed');
  expect(result.current.body).toBe('Body');
  act(() => result.current.undo());
  expect(result.current.meta.title).toBe('Original');
  expect(result.current.isDirty).toBe(false);
  act(() => result.current.redo());
  expect(result.current.meta.title).toBe('Renamed');
});
