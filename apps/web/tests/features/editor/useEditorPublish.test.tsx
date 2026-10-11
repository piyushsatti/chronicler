import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '../../../src/providers.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { editorHarness } from './editor-test-utils.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import * as adapters from '../../../src/features/editor/adapters/editorMutations.js';

vi.mock('../../../src/features/editor/adapters/editorMutations.js', () => ({
  previewBodyAs: vi.fn(),
  createDocument: vi.fn(),
  createQuest: vi.fn(),
  updateDocument: vi.fn(),
  updateQuest: vi.fn(),
  editPublishedDocument: vi.fn(),
  publishDocument: vi.fn(),
  maybeSyncQuestDiscord: vi.fn(),
}));
const initial: EditorLoadResult = {
  meta: { title: 'Original' },
  body: 'Original body',
  recordId: 'quest-id',
  documentId: 'doc-id',
  redirectHint: 'Q-1',
  briefPublished: true,
};
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
function setup(input: Partial<Parameters<typeof useEditorPublish>[0]> = {}) {
  const onSuccess = vi.fn();
  const onInvalidTitle = vi.fn();
  const hook = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'quest',
        mode: 'edit',
        initial,
        meta: {
          title: ' New title ',
          scheduledAt: '2026-10-15T18:00:00Z',
          kinds: ['standard'],
          regions: ['region-id'],
          genres: ['social'],
          tags: ['tag'],
          apl: 7,
          signupType: 'dm_pick',
        },
        body: ' New body ',
        onSuccess,
        onInvalidTitle,
        ...input,
      }),
    { wrapper },
  );
  return { ...hook, onSuccess, onInvalidTitle };
}
async function publish(hook: ReturnType<typeof setup>): Promise<void> {
  await act(async () => {
    await hook.result.current.mutateAsync();
  });
}

describe('useEditorPublish (local adapter-dispatch proof, not server parity)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adapters.previewBodyAs).mockResolvedValue('Preview');
    vi.mocked(adapters.createQuest).mockResolvedValue({
      id: 'quest-new',
      redirectPath: '/quests/Q-NEW',
    });
    vi.mocked(adapters.updateQuest).mockResolvedValue({
      id: 'quest-id',
      redirectPath: '/quests/Q-1',
    });
    vi.mocked(adapters.createDocument).mockResolvedValue({
      id: 'doc-new',
      redirectPath: '/summaries/new',
    });
    vi.mocked(adapters.updateDocument).mockResolvedValue({
      id: 'doc-id',
      redirectPath: '/summaries/edit',
    });
    vi.mocked(adapters.editPublishedDocument).mockResolvedValue({
      id: 'doc-id',
      redirectPath: '/summaries/edit',
    });
    vi.mocked(adapters.publishDocument).mockResolvedValue(undefined);
    vi.mocked(adapters.maybeSyncQuestDiscord).mockResolvedValue(
      'Discord retry needed.',
    );
  });

  it('updates quest, edits its published brief atomically, then syncs Discord', async () => {
    const hook = setup();
    await publish(hook);
    expect(adapters.updateQuest).toHaveBeenCalledWith(
      'quest-id',
      expect.objectContaining({
        title: 'New title',
        briefBody: ' New body ',
        kinds: ['standard'],
        regionIds: ['region-id'],
        genres: ['social'],
        tags: ['tag'],
        apl: 7,
        signupType: 'dm_pick',
      }),
    );
    expect(adapters.editPublishedDocument).toHaveBeenCalledWith({
      documentId: 'doc-id',
      title: 'New title',
      body: 'New body',
    });
    expect(adapters.publishDocument).not.toHaveBeenCalled();
    expect(adapters.maybeSyncQuestDiscord).toHaveBeenCalledWith('quest-id');
    expect(vi.mocked(adapters.updateQuest).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(adapters.editPublishedDocument).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(adapters.editPublishedDocument).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(adapters.maybeSyncQuestDiscord).mock.invocationCallOrder[0],
    );
    expect(hook.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectPath: '/quests/Q-1',
        warning: 'Discord retry needed.',
      }),
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it('updates and publishes an unpublished quest brief, before Discord sync', async () => {
    const hook = setup({ initial: { ...initial, briefPublished: false } });
    await publish(hook);
    expect(adapters.updateDocument).toHaveBeenCalledWith('doc-id', {
      title: 'New title',
      body: 'New body',
    });
    expect(adapters.publishDocument).toHaveBeenCalledWith('doc-id');
    expect(adapters.editPublishedDocument).not.toHaveBeenCalled();
  });

  it('creates a quest then syncs it, without document-edit dispatch', async () => {
    const hook = setup({ mode: 'new' });
    await publish(hook);
    expect(adapters.createQuest).toHaveBeenCalledTimes(1);
    expect(adapters.updateQuest).not.toHaveBeenCalled();
    expect(adapters.editPublishedDocument).not.toHaveBeenCalled();
    expect(adapters.maybeSyncQuestDiscord).toHaveBeenCalledWith('quest-new');
  });

  it('uses the atomic published-document endpoint for published document edits', async () => {
    const hook = setup({ typeKey: 'guide' });
    await publish(hook);
    expect(adapters.editPublishedDocument).toHaveBeenCalledWith({
      documentId: 'doc-id',
      title: 'New title',
      body: 'New body',
    });
    expect(adapters.updateDocument).not.toHaveBeenCalled();
    expect(adapters.publishDocument).not.toHaveBeenCalled();
    expect(adapters.maybeSyncQuestDiscord).not.toHaveBeenCalled();
  });

  it('updates then publishes an unpublished document, preserving kind/category', async () => {
    const hook = setup({
      typeKey: 'codex',
      category: 'faction',
      initial: { ...initial, briefPublished: false },
    });
    await publish(hook);
    expect(adapters.updateDocument).toHaveBeenCalledWith('doc-id', {
      title: 'New title',
      body: ' New body ',
      kind: 'codex',
      category: 'faction',
    });
    expect(adapters.publishDocument).toHaveBeenCalledWith('doc-id');
  });

  it('creates and publishes a new document with its mapped kind', async () => {
    const hook = setup({ typeKey: 'dm-table', mode: 'new' });
    await publish(hook);
    expect(adapters.createDocument).toHaveBeenCalledWith({
      title: 'New title',
      body: ' New body ',
      kind: 'dm_table',
      category: null,
      visibility: 'public',
    });
    expect(adapters.publishDocument).toHaveBeenCalledWith('doc-new');
  });

  it('rejects a blank title before any adapter dispatch and keeps validation callback', async () => {
    const hook = setup({ meta: { title: '  ' } });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
        kind: 'safe',
        userMessage: 'Title is required',
      });
    });
    expect(hook.onInvalidTitle).toHaveBeenCalledOnce();
    expect(adapters.updateQuest).not.toHaveBeenCalled();
    expect(hook.onSuccess).not.toHaveBeenCalled();
  });

  it('stops after a failed published brief edit, without syncing or clearing the draft', async () => {
    vi.mocked(adapters.editPublishedDocument).mockRejectedValue({
      kind: 'upstream',
      userMessage: 'Something went wrong. Please try again.',
    });
    const hook = setup();
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
        kind: 'upstream',
      });
    });
    expect(adapters.maybeSyncQuestDiscord).not.toHaveBeenCalled();
    expect(hook.onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
  });

  it('keeps the workspace draft after publish failure, then clears it only on successful retry', async () => {
    vi.mocked(adapters.editPublishedDocument).mockRejectedValueOnce({
      kind: 'upstream',
      userMessage: 'Something went wrong. Please try again.',
    });
    const key = draftStorageKey('guide', 'quest-id');
    const { result } = renderHook(
      () =>
        useEditorWorkspace({ typeKey: 'guide', mode: 'edit', initial, enabled: true }),
      editorHarness('/rules', '*'),
    );
    act(() => result.current.setBody('Retained dirty body'));
    act(() => result.current.onPublish());
    await waitFor(() =>
      expect(result.current.mutationError).toMatchObject({ kind: 'upstream' }),
    );
    expect(result.current.body).toBe('Retained dirty body');
    expect(result.current.isDirty).toBe(true);
    expect(localStorage.getItem(key)).toContain('Retained dirty body');
    act(() => result.current.onPublish());
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.mutationError).toBeNull();
  });

  it('retains failure after document publish without invoking success/navigation', async () => {
    vi.mocked(adapters.publishDocument).mockRejectedValue(new Error('publish failed'));
    const hook = setup({ typeKey: 'summary', mode: 'new' });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toThrow('publish failed');
    });
    expect(hook.onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
  });
});
