import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '../../../src/providers.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import * as adapters from '../../../src/features/editor/adapters/editorMutations.js';
vi.mock('../../../src/features/editor/adapters/editorMutations.js', () => ({
  createDocument: vi.fn(),
  createQuest: vi.fn(),
  updateDocument: vi.fn(),
  updateQuest: vi.fn(),
  editPublishedDocument: vi.fn(),
  publishDocument: vi.fn(),
}));
const initial: EditorLoadResult = {
  meta: { title: 'Original', kind: 'rule', category: 'guide' },
  body: 'Original body',
  canEditBody: true,
  canEditMetadata: true,
  status: 'published',
  visibility: 'public',
  policy: [],
  readerIds: [],
  authorId: 'actor',
  frontmatter: {},
  recordId: 'quest-id',
  documentId: 'doc-id',
  redirectHint: 'original',
  briefPublished: true,
  updatedAt: '2026-10-15T17:00:00Z',
  documentVersion: 1,
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
          durationHours: '3',
          slotsMax: '4',
          kinds: ['standard'],
          regions: ['region-id'],
          genres: [],
          tags: [],
          apl: '',
          signupType: 'dm_pick',
          additionalInfo: 'Notes',
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
async function save(hook: ReturnType<typeof setup>, publish?: boolean) {
  await act(async () => {
    await hook.result.current.mutateAsync(publish);
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adapters.createQuest).mockResolvedValue({
    id: 'quest-id',
    redirectPath: '/quests/Q-1',
  });
  vi.mocked(adapters.updateQuest).mockResolvedValue({
    id: 'quest-id',
    redirectPath: '/quests/Q-1',
  });
  vi.mocked(adapters.createDocument).mockResolvedValue({
    id: 'doc-new',
    slug: 'new-doc',
    version: 1,
    redirectPath: '/',
  });
  vi.mocked(adapters.updateDocument).mockResolvedValue({
    id: 'doc-id',
    slug: 'edited-doc',
    version: 2,
    redirectPath: '/',
  });
  vi.mocked(adapters.editPublishedDocument).mockResolvedValue({
    id: 'doc-id',
    slug: 'edited-doc',
    version: 2,
    redirectPath: '/',
  });
  vi.mocked(adapters.publishDocument).mockResolvedValue({
    id: 'doc-id',
    slug: 'published-doc',
    version: 3,
    redirectPath: '/',
  });
});
describe('editor command dispatch', () => {
  it('saves a Quest and its brief through one Quest command only', async () => {
    const hook = setup();
    await save(hook);
    expect(adapters.updateQuest).toHaveBeenCalledWith(
      'quest-id',
      expect.objectContaining({
        title: 'New title',
        briefBody: ' New body ',
        additionalInfo: 'Notes',
        durationHours: 3,
        slotsMax: 4,
      }),
      initial.updatedAt,
      expect.any(String),
    );
    expect(adapters.editPublishedDocument).not.toHaveBeenCalled();
    expect(adapters.updateDocument).not.toHaveBeenCalled();
    expect(adapters.publishDocument).not.toHaveBeenCalled();
  });
  it('omits an unchanged or unavailable Quest body from metadata updates', async () => {
    const hook = setup({
      initial: { ...initial, body: null, canEditBody: false },
      body: '',
    });
    await save(hook);
    expect(vi.mocked(adapters.updateQuest).mock.calls[0][1]).not.toHaveProperty(
      'briefBody',
    );
  });
  it.each([
    ['guide', 'rule', 'guide'],
    ['ruling', 'rule', 'ruling'],
    ['dm-table', 'community', 'dm_table'],
    ['summary', 'summary', null],
  ] as const)(
    'creates %s with the current Document kind',
    async (typeKey, kind, category) => {
      const hook = setup({
        typeKey,
        mode: 'new',
        initial: { ...initial, documentId: null, briefPublished: false },
        meta: { title: 'New title' },
      });
      await save(hook);
      expect(adapters.createDocument).toHaveBeenCalledWith(
        {
          title: 'New title',
          body: ' New body ',
          kind,
          category,
          visibility: 'public',
        },
        expect.any(String),
      );
    },
  );
  it('saves a server draft without publishing it', async () => {
    const hook = setup({
      typeKey: 'codex',
      initial: { ...initial, briefPublished: false },
      meta: { title: 'Codex', slug: 'imported', category: 'Imported/NPC' },
    });
    await save(hook, false);
    expect(adapters.updateDocument).toHaveBeenCalledWith(
      'doc-id',
      expect.objectContaining({
        kind: 'codex_entry',
        category: 'Imported/NPC',
        expectedRevision: 1,
      }),
      expect.any(String),
    );
    expect(adapters.publishDocument).not.toHaveBeenCalled();
  });
  it('preserves body whitespace and omits an unchanged body', async () => {
    const hook = setup({ typeKey: 'guide', body: initial.body ?? '' });
    await save(hook);
    expect(adapters.editPublishedDocument).toHaveBeenCalledWith(
      {
        documentId: 'doc-id',
        title: 'New title',
        kind: 'rule',
        expectedRevision: 1,
      },
      expect.any(String),
    );
  });
  it('allows metadata edits without whole-body capability', async () => {
    const hook = setup({
      typeKey: 'guide',
      initial: { ...initial, body: null, canEditBody: false },
      body: '',
    });
    await save(hook);
    expect(
      vi.mocked(adapters.editPublishedDocument).mock.calls[0][0],
    ).not.toHaveProperty('body');
  });
  it('rejects body replacement when projection is incomplete', async () => {
    const hook = setup({
      typeKey: 'guide',
      initial: { ...initial, canEditBody: false },
    });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
        kind: 'safe',
      });
    });
    expect(adapters.editPublishedDocument).not.toHaveBeenCalled();
  });
  it('rejects missing metadata permission and expired retained sessions', async () => {
    const hook = setup({ admit: () => false });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
        kind: 'safe',
      });
    });
    expect(adapters.updateQuest).not.toHaveBeenCalled();
  });
  it.each(['0', '4x', '-2'])(
    'does not replace invalid numeric input %s with a fallback',
    async (slotsMax) => {
      const hook = setup({
        meta: {
          title: 'Quest',
          durationHours: '3',
          slotsMax,
          scheduledAt: '2026-10-15T18:00:00Z',
          kinds: ['standard'],
          regions: ['region'],
          signupType: 'dm_pick',
        },
      });
      await act(async () => {
        await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
          kind: 'safe',
        });
      });
      expect(adapters.updateQuest).not.toHaveBeenCalled();
      expect(hook.onInvalidTitle).toHaveBeenCalled();
    },
  );
  it('keeps a successful create after publication fails, avoiding duplicate documents on retry', async () => {
    vi.mocked(adapters.publishDocument).mockRejectedValueOnce(new Error('conflict'));
    const hook = setup({
      typeKey: 'summary',
      mode: 'new',
      initial: { ...initial, documentId: null, briefPublished: false },
    });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toThrow('conflict');
    });
    expect(hook.onSuccess).not.toHaveBeenCalled();
    await save(hook);
    expect(adapters.createDocument).toHaveBeenCalledTimes(1);
    expect(adapters.updateDocument).not.toHaveBeenCalled();
    expect(vi.mocked(adapters.publishDocument).mock.calls[0]).toEqual(
      vi.mocked(adapters.publishDocument).mock.calls[1],
    );
  });
});

it('does not publish or navigate a created draft after the account/record scope changes', async () => {
  let finish!: (value: adapters.EditorPublishResult) => void;
  vi.mocked(adapters.createDocument).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onSuccess = vi.fn();
  const { result, rerender } = renderHook(
    ({ scopeKey }) =>
      useEditorPublish({
        typeKey: 'summary',
        mode: 'new',
        initial: {
          ...initial,
          recordId: 'new',
          documentId: null,
          briefPublished: false,
        },
        meta: { title: 'Summary' },
        body: 'Private draft',
        scopeKey,
        onSuccess,
        onInvalidTitle: vi.fn(),
      }),
    { wrapper, initialProps: { scopeKey: 'account-a:new' } },
  );
  let saving!: Promise<adapters.EditorPublishResult>;
  act(() => {
    saving = result.current.mutateAsync();
  });
  await act(async () => {
    await Promise.resolve();
  });
  rerender({ scopeKey: 'account-b:new' });
  await act(async () => {
    finish({ id: 'private-doc', slug: 'private-doc', version: 1, redirectPath: '/' });
    await expect(saving).rejects.toMatchObject({ kind: 'safe' });
  });
  expect(adapters.publishDocument).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});
it('reuses the create replay key after a lost response', async () => {
  vi.mocked(adapters.createDocument).mockRejectedValueOnce(new Error('lost response'));
  const hook = setup({
    typeKey: 'summary',
    mode: 'new',
    initial: { ...initial, documentId: null, briefPublished: false },
  });
  await act(async () => {
    await expect(hook.result.current.mutateAsync(false)).rejects.toThrow(
      'lost response',
    );
  });
  await save(hook, false);
  expect(vi.mocked(adapters.createDocument).mock.calls[0]).toEqual(
    vi.mocked(adapters.createDocument).mock.calls[1],
  );
});

it.each(['last_game_played', 'dm_pick'])(
  'creates a Quest using retained signup type %s',
  async (signupType) => {
    const hook = setup({
      mode: 'new',
      meta: {
        title: 'Quest',
        durationHours: '3',
        slotsMax: '4',
        scheduledAt: '2026-10-15T18:00:00Z',
        kinds: ['standard'],
        regions: ['region'],
        genres: [],
        tags: [],
        signupType,
      },
    });
    await save(hook);
    expect(adapters.createQuest).toHaveBeenCalledWith(
      expect.objectContaining({ signupType }),
      expect.any(String),
    );
  },
);
it.each(['open', 'application', 'invite', 'last_played'])(
  'rejects retired signup type %s before sending a command',
  async (signupType) => {
    const hook = setup({
      mode: 'new',
      meta: {
        title: 'Quest',
        durationHours: '3',
        slotsMax: '4',
        scheduledAt: '2026-10-15T18:00:00Z',
        kinds: ['standard'],
        regions: ['region'],
        genres: [],
        tags: [],
        signupType,
      },
    });
    await act(async () => {
      await expect(hook.result.current.mutateAsync()).rejects.toMatchObject({
        kind: 'safe',
      });
    });
    expect(adapters.createQuest).not.toHaveBeenCalled();
  },
);
