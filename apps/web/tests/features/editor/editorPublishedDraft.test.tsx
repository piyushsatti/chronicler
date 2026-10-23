import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import { editorHarness } from './editor-test-utils.js';
import { EditorWorkspace } from '../../../src/features/editor/EditorWorkspace.js';

const source: EditorLoadResult = {
  meta: { title: 'Published guide', slug: 'published-guide', category: 'guide' },
  body: 'Published source',
  canEditBody: true,
  canEditMetadata: true,
  status: 'published',
  visibility: 'public',
  policy: null,
  readerIds: [],
  authorId: 'actor',
  frontmatter: {},
  recordId: 'published-guide',
  documentId: 'published-guide',
  redirectHint: 'published-guide',
  briefPublished: true,
  updatedAt: null,
  documentVersion: 7,
};

it('saves a published page draft locally, keeps its dirty guard and publishes only on Publish', async () => {
  let writes = 0;
  const onReload = vi.fn(async () => {});
  server.use(
    graphql.mutation('EditPublishedDocument', ({ variables }) => {
      writes++;
      expect(variables.input).toMatchObject({
        expectedRevision: 7,
        body: 'Private changes',
      });
      return HttpResponse.json({
        data: {
          editPublishedDocument: {
            id: source.documentId,
            slug: 'published-guide',
            version: 8,
          },
        },
      });
    }),
    graphql.mutation('EditorUpsertQuestSummary', () => {
      throw new Error('Local draft must not upsert');
    }),
    graphql.mutation('PublishDocument', () => {
      throw new Error('Already published page must not republish');
    }),
  );
  const { result } = renderHook(
    () =>
      useEditorWorkspace({
        typeKey: 'guide',
        mode: 'edit',
        initial: source,
        enabled: true,
        timeZone: 'UTC',
        actorId: 'draft-owner',
        onReload,
      }),
    editorHarness('/rules/guides/published-guide/edit', '*'),
  );
  act(() => result.current.setBody('Private changes'));
  act(() => result.current.onSaveDraft());
  expect(result.current.statusMessage).toBe(
    'Draft saved on this device. Publish to update the live page.',
  );
  expect(result.current.isDirty).toBe(true);
  expect(writes).toBe(0);
  const stored = JSON.parse(
    localStorage.getItem(draftStorageKey('guide', source.recordId, 'draft-owner', 7)) ??
      'null',
  );
  expect(stored).toMatchObject({
    body: 'Private changes',
    meta: { title: 'Published guide' },
  });
  act(() => result.current.onPublish());
  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() => expect(result.current.isDirty).toBe(false));
});

it('reports failed device storage without mutating or discarding published page changes', () => {
  const { result } = renderHook(
    () =>
      useEditorWorkspace({
        typeKey: 'guide',
        mode: 'edit',
        initial: source,
        enabled: true,
        timeZone: 'UTC',
        actorId: 'storage-failure-owner',
      }),
    editorHarness('/rules/guides/published-guide/edit', '*'),
  );
  act(() => result.current.setBody('Keep these edits'));
  const storage = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full');
  });
  try {
    act(() => result.current.onSaveDraft());
    expect(result.current.statusMessage).toBe(
      'Draft could not be saved on this device. Keep this page open to preserve your edits.',
    );
    expect(result.current.body).toBe('Keep these edits');
    expect(result.current.isDirty).toBe(true);
  } finally {
    storage.mockRestore();
  }
});

it('recovers a saved published draft after closing and a revision advance without exposing it to another account or publishing it', async () => {
  let writes = 0;
  server.use(
    graphql.mutation('EditPublishedDocument', () => {
      writes++;
      return HttpResponse.json({ data: null });
    }),
  );
  function Workspace({
    initial,
    actorId,
  }: {
    initial: EditorLoadResult;
    actorId: string;
  }) {
    const view = useEditorWorkspace({
      typeKey: 'guide',
      mode: 'edit',
      initial,
      enabled: true,
      timeZone: 'UTC',
      actorId,
    });
    return <EditorWorkspace view={view} />;
  }
  const open = (initial: EditorLoadResult, actorId: string) =>
    render(
      <Workspace initial={initial} actorId={actorId} />,
      editorHarness('/rules/guides/published-guide/edit', '*'),
    );
  const first = open(source, 'draft-owner');
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: 'Saved private title' },
  });
  fireEvent.mouseDown(screen.getByText('Published source', { exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Document body' }), {
    target: { value: 'Saved private body' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(screen.getByText(/Draft saved on this device\./)).toBeVisible();
  first.unmount();

  const advanced = {
    ...source,
    meta: { ...source.meta, title: 'Another editor’s title' },
    body: 'Another editor’s body',
    documentVersion: 8,
  };
  const otherAccount = open(advanced, 'another-account');
  expect(screen.queryByRole('button', { name: /Recover saved draft/ })).toBeNull();
  expect(screen.queryByText(/Saved private/)).toBeNull();
  otherAccount.unmount();

  open(advanced, 'draft-owner');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
    'Another editor’s title',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved draft from revision 7' }));
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
    'Saved private title',
  );
  expect(await screen.findByText('Saved private body', { exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(writes).toBe(0);
  expect(
    localStorage.getItem(draftStorageKey('guide', source.recordId, 'draft-owner', 7)),
  ).toContain('Saved private body');
  expect(
    localStorage.getItem(draftStorageKey('guide', source.recordId, 'draft-owner', 8)),
  ).toBeNull();
});

it.each(['guide', 'ruling', 'summary', 'dm-table'] as const)(
  'rejects direct publish of a recovered %s and preserves the current revision’s saved draft',
  async (typeKey) => {
    const savedKey = draftStorageKey(typeKey, source.recordId, 'draft-owner', 7);
    localStorage.setItem(
      savedKey,
      JSON.stringify({
        meta: { ...source.meta, title: 'Older private title' },
        body: 'Older private body',
        savedAt: '2026-10-23T00:00:00Z',
      }),
    );
    let writes = 0;
    server.use(
      graphql.mutation('EditPublishedDocument', () => {
        writes++;
        return HttpResponse.json({ data: null });
      }),
    );
    const { result } = renderHook(
      () =>
        useEditorWorkspace({
          typeKey,
          mode: 'edit',
          initial: { ...source, documentVersion: 8 },
          enabled: true,
          timeZone: 'UTC',
          actorId: 'draft-owner',
        }),
      editorHarness('/rules/guides/published-guide/edit', '*'),
    );
    act(() => result.current.setBody('Current revision’s saved draft'));
    act(() => result.current.onSaveDraft());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      act(() => result.current.draftRecovery?.recover(savedKey));
    } finally {
      confirm.mockRestore();
    }
    expect(result.current.meta.title).toBe('Older private title');
    expect(result.current.body).toBe('Older private body');
    expect(result.current.stale).toBe(true);
    expect(result.current.publishDisabled).toBe(true);
    act(() => result.current.onSaveDraft());
    act(() => result.current.onPublish());
    await waitFor(() => expect(result.current.mutationError).not.toBeNull());
    expect(writes).toBe(0);
    expect(localStorage.getItem(savedKey)).toContain('Older private body');
    expect(
      localStorage.getItem(draftStorageKey(typeKey, source.recordId, 'draft-owner', 8)),
    ).toContain('Current revision’s saved draft');
  },
);
