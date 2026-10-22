import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { useEditorPage } from '../../../src/features/editor/hooks/useEditorPage.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import { updateDocument } from '../../../src/features/editor/adapters/editorMutations.js';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
const id = '99999999-9999-4999-8999-999999999999';
it('saves a draft to the server and reloads its returned revision without publishing', async () => {
  seedEditorSession();
  let document = {
    id,
    slug: 'draft-lore',
    kind: 'codex_entry',
    category: 'Lore',
    title: 'Draft lore',
    status: 'draft',
    version: 1,
    effectiveBody: 'Server source',
    canEditBody: true,
    canEditMetadata: true,
    visibility: 'public',
    policy: [],
    readerIds: [],
    authorId: 'actor',
    frontmatter: {},
  };
  let reads = 0;
  let writes = 0;
  server.use(
    graphql.query('EditorDocumentById', () => {
      reads++;
      return HttpResponse.json({ data: { documentById: document } });
    }),
    graphql.mutation('UpdateDocument', ({ variables }) => {
      writes++;
      expect(variables.input).toEqual({
        expectedRevision: 1,
        title: 'Draft lore',
        body: 'New draft source',
      });
      document = { ...document, version: 2, effectiveBody: 'New draft source' };
      return HttpResponse.json({
        data: {
          updateDocument: { id, slug: document.slug, version: document.version },
        },
      });
    }),
    graphql.mutation('PublishDocument', () => {
      throw new Error('Draft save must not publish');
    }),
  );
  const { result } = renderHook(
    () => useEditorPage({ typeKey: 'codex', mode: 'edit' }),
    editorHarness(`/codex/${id}/edit`, '/codex/:id/edit'),
  );
  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => {
    if (result.current.status === 'ready')
      result.current.view.setBody('New draft source');
  });
  act(() => {
    if (result.current.status === 'ready') result.current.view.onSaveDraft();
  });
  await waitFor(() => {
    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.view.isDirty).toBe(false);
    expect(result.current.view.body).toBe('New draft source');
    expect(result.current.view.stale).toBe(false);
    expect(reads).toBeGreaterThan(1);
  });
  expect(writes).toBe(1);
  expect(document.status).toBe('draft');
  expect(document.version).toBe(2);
});

it.each(['Save draft', 'Publish'])(
  'isolates a new same-member session from a held %s response',
  async (action) => {
    seedEditorSession();
    let document = {
      id,
      slug: 'private-draft',
      kind: 'codex_entry',
      category: 'Lore',
      title: 'Private draft',
      status: 'draft',
      version: 2,
      effectiveBody: 'Server source',
      canEditBody: true,
      canEditMetadata: true,
      visibility: 'restricted',
      policy: [],
      readerIds: [],
      authorId: 'discord-editor',
      frontmatter: {},
    };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reads: number[] = [];
    const writes: unknown[] = [];
    let publications = 0;
    server.use(
      graphql.query('EditorDocumentById', () => {
        reads.push(document.version);
        return HttpResponse.json({ data: { documentById: document } });
      }),
      graphql.mutation('UpdateDocument', async ({ variables }) => {
        writes.push(variables.input);
        document = {
          ...document,
          version: 3,
          effectiveBody: 'SAME ACCOUNT COMMITTED',
        };
        await held;
        return HttpResponse.json({
          data: { updateDocument: { id, slug: document.slug, version: 3 } },
        });
      }),
      graphql.mutation('PublishDocument', () => {
        publications++;
        return HttpResponse.json({
          data: { publishDocument: { id, slug: document.slug, version: 4 } },
        });
      }),
    );
    const harness = editorHarness(`/codex/${id}/edit`, '/codex/:id/edit');
    const rendered = render(<EditorRoute typeKey="codex" mode="edit" />, harness);
    let released = false;
    try {
      fireEvent.mouseDown(await screen.findByText('Server source', { exact: true }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Document body' }), {
        target: { value: 'SAME ACCOUNT COMMITTED' },
      });
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toEqual({
        expectedRevision: 2,
        title: 'Private draft',
        body: 'SAME ACCOUNT COMMITTED',
      });
      const pendingSave = harness.queryClient
        .getMutationCache()
        .getAll()
        .find((mutation) => mutation.state.status === 'pending');
      if (!pendingSave) throw new Error('Expected held save');
      const oldValue = localStorage.getItem(TOKEN_KEY);
      const newValue = `e30.${btoa(JSON.stringify({ member_id: 'discord-editor', exp: Date.now() / 1000 + 7200 }))}.new-session`;
      act(() => {
        localStorage.setItem(TOKEN_KEY, newValue);
        window.dispatchEvent(
          new StorageEvent('storage', { key: TOKEN_KEY, oldValue, newValue }),
        );
      });
      await waitFor(() => expect(reads).toEqual([2, 3]));
      await screen.findByText('SAME ACCOUNT COMMITTED', { exact: true });
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
      expect(
        screen.queryByRole('region', { name: 'Body editing unavailable' }),
      ).not.toBeInTheDocument();
      fireEvent.mouseDown(screen.getByText('SAME ACCOUNT COMMITTED', { exact: true }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Document body' }), {
        target: { value: 'NEW TOKEN UNSAVED' },
      });
      expect(screen.getByText('Unsaved draft', { exact: true })).toBeVisible();
      release();
      released = true;
      await waitFor(() => expect(pendingSave.state.status).not.toBe('pending'));
      expect(screen.getByRole('textbox', { name: 'Document body' })).toHaveValue(
        'NEW TOKEN UNSAVED',
      );
      expect(screen.getByText('Unsaved draft', { exact: true })).toBeVisible();
      expect(screen.queryByText('Saved on the server.')).not.toBeInTheDocument();
      expect(screen.queryByText('Published.')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(reads).toEqual([2, 3]);
      expect(publications).toBe(0);
      expect(document.version).toBe(3);
      expect(document.effectiveBody).toBe('SAME ACCOUNT COMMITTED');
      expect(
        localStorage.getItem(draftStorageKey('codex', id, 'discord-editor', 3)),
      ).toContain('NEW TOKEN UNSAVED');
    } finally {
      rendered.unmount();
      if (!released) release();
    }
  },
);

describe('wire omission', () => {
  it('omits missing body and category rather than turning either into a replacement', async () => {
    server.use(
      graphql.mutation('UpdateDocument', ({ variables }) => {
        expect(variables.input).toEqual({
          expectedRevision: 7,
          title: 'Metadata only',
        });
        return HttpResponse.json({
          data: { updateDocument: { id, slug: 'safe', version: 8 } },
        });
      }),
    );
    await updateDocument(id, { title: 'Metadata only', expectedRevision: 7 });
  });
});
