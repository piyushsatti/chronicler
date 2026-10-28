import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorPreview } from '../../../src/features/editor/hooks/useEditorPreview.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import {
  EditorShell,
  type EditorShellProps,
} from '../../../src/features/editor/EditorShell.js';
import { editorHarness } from './editor-test-utils.js';

const loadAudienceMembers = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/editor/adapters/editorAudienceMembers.js', () => ({
  loadAudienceMembers,
  loadAudienceReader: vi.fn(),
}));

describe('preview "View as"', () => {
  it('sends the chosen audience, and a member handle without "@"', async () => {
    const requests: unknown[] = [];
    server.use(
      graphql.query('PreviewBody', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({ data: { previewBody: 'Scoped' } });
      }),
    );
    const { result } = renderHook(() => useEditorPreview('> [!dm]\n> Secret'), {
      ...editorHarness('/editor-demo', '/editor-demo'),
    });
    act(() => result.current.onPreview());
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => result.current.setViewer({ kind: 'dm' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => result.current.setViewer({ kind: 'member', handle: 'mortal' }));
    await waitFor(() =>
      expect(result.current.preview).toEqual({ status: 'ready', body: 'Scoped' }),
    );
    expect(requests).toEqual([
      { body: '> [!dm]\n> Secret', audience: 'PLAYER', authorId: null },
      { body: '> [!dm]\n> Secret', audience: 'DM', authorId: null },
      {
        body: '> [!dm]\n> Secret',
        audience: 'PLAYER',
        authorId: null,
        memberHandle: 'mortal',
      },
    ]);
    expect(result.current.viewer).toEqual({ kind: 'member', handle: 'mortal' });
  });

  it.each([
    ['NOT_FOUND', 'No active member has the handle @ghost. Choose another member.'],
    [
      'INVALID',
      '@ghost can’t be previewed: a handle uses only letters, numbers, _ . and -.',
    ],
  ])('says why a member handle was refused (%s)', async (code, message) => {
    server.use(
      graphql.query('PreviewBody', () =>
        HttpResponse.json({
          errors: [{ message: 'refused', extensions: { code } }],
        }),
      ),
    );
    const { result } = renderHook(() => useEditorPreview('Body'), {
      ...editorHarness('/editor-demo', '/editor-demo'),
    });
    act(() => result.current.setViewer({ kind: 'member', handle: 'ghost' }));
    await waitFor(() =>
      expect(result.current.preview).toMatchObject({
        status: 'error',
        error: { userMessage: message, debugId: 'editor:preview:member' },
      }),
    );
  });
});

describe('preview summary as a member', () => {
  it('counts the redacted blocks in the member’s server preview', async () => {
    const bars = `> ${'█'.repeat(20)}`;
    const requests: Record<string, unknown>[] = [];
    server.use(
      graphql.query('PreviewBody', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({
          data: {
            previewBody: ['Intro', '', '> [!redacted]', bars, '', '> [!redacted]', bars].join(
              '\n',
            ),
          },
        });
      }),
    );
    const initial: EditorLoadResult = {
      meta: { title: 'Guide', slug: 'guide', category: 'guide' },
      body: 'Intro\n\n> [!dm]\n> Secret\n\n> [!dm:@gm]\n> For the GM',
      canEditBody: true,
      canEditMetadata: true,
      status: 'draft',
      visibility: 'public',
      policy: null,
      readerIds: [],
      authorId: 'actor',
      frontmatter: {},
      recordId: 'guide',
      documentId: 'guide',
      redirectHint: 'guide',
      briefPublished: false,
      updatedAt: null,
      documentVersion: 1,
    };
    const { result } = renderHook(
      () =>
        useEditorWorkspace({
          typeKey: 'guide',
          mode: 'edit',
          initial,
          enabled: true,
          timeZone: 'UTC',
          actorId: 'summary-owner',
        }),
      editorHarness('/rules/guides/guide/edit', '*'),
    );
    act(() => result.current.onPreviewViewer({ kind: 'member', handle: 'mortal' }));
    await waitFor(() =>
      expect(result.current.previewSummary).toBe('Hidden from @mortal: 2 blocks'),
    );
    expect(requests.at(-1)).toMatchObject({ audience: 'PLAYER', memberHandle: 'mortal' });
  });
});

const emptyOptions = {
  regions: { status: 'empty' as const },
  genres: { status: 'empty' as const },
  series: { status: 'empty' as const },
  voiceChannels: { status: 'empty' as const },
  guideGroups: [],
  places: {
    maps: [],
    atlasCode: '',
    setAtlasCode: () => {},
    nodes: undefined,
    canEdit: false,
    loading: false,
    error: null,
    onRetry: () => {},
  },
};

function shellProps(overrides: Partial<EditorShellProps> = {}): EditorShellProps {
  return {
    typeKey: 'guide',
    timeZone: 'UTC',
    meta: { title: 'Guide title' },
    body: '> [!dm]\n> Secret',
    setMeta: vi.fn(),
    setBody: vi.fn(),
    onSaveDraft: vi.fn(),
    onPublish: vi.fn(),
    cancelTo: '/rules',
    preview: { status: 'ready', body: '> [!redacted]\n> ████████████████████' },
    onPreview: vi.fn(),
    options: emptyOptions,
    previewViewer: { kind: 'player' },
    onPreviewViewer: vi.fn(),
    previewSummary: 'Hidden from players: 1 block (1 DMs only)',
    ...overrides,
  };
}

function renderShell(props: EditorShellProps) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <EditorShell {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('preview switcher in the editor', () => {
  beforeEach(() => {
    loadAudienceMembers.mockReset();
    loadAudienceMembers.mockResolvedValue({
      total: 1,
      entries: [
        {
          memberId: '00000000-0000-4000-8000-000000000001',
          handle: 'mortal',
          displayName: 'Mortal Reader',
        },
      ],
    });
  });

  it('shows the summary above the scoped preview and switches viewers', async () => {
    const props = shellProps();
    renderShell(props);
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const preview = screen.getByRole('region', { name: 'Read preview' });
    const summary = within(preview).getByText('Hidden from players: 1 block (1 DMs only)');
    expect(summary).toBeVisible();
    // Announced when a new viewer's summary arrives.
    expect(summary).toHaveAttribute('aria-live', 'polite');
    expect(preview.querySelector('[data-variant="redacted"]')).not.toBeNull();
    await userEvent.click(within(preview).getByRole('button', { name: 'DM' }));
    expect(props.onPreviewViewer).toHaveBeenCalledWith({ kind: 'dm' });
    await userEvent.click(within(preview).getByRole('button', { name: '@member…' }));
    const picker = await screen.findByRole('dialog', { name: 'View as a member' });
    await userEvent.type(within(picker).getByRole('textbox'), 'mor');
    await userEvent.click(
      await within(picker).findByRole('button', { name: 'Choose Mortal Reader' }),
    );
    expect(props.onPreviewViewer).toHaveBeenLastCalledWith({
      kind: 'member',
      handle: 'mortal',
    });
  });

  it('shows a refused member handle inline', async () => {
    renderShell(
      shellProps({
        previewViewer: { kind: 'member', handle: 'ghost' },
        previewSummary: null,
        preview: {
          status: 'error',
          error: {
            kind: 'safe',
            userMessage: 'No active member has the handle @ghost. Choose another member.',
            debugId: 'editor:preview:member',
          },
        },
      }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const preview = screen.getByRole('region', { name: 'Read preview' });
    expect(within(preview).getByRole('button', { name: '@ghost' })).toBeInTheDocument();
    expect(preview).toHaveTextContent(
      'No active member has the handle @ghost. Choose another member.',
    );
    expect(preview.querySelector('.state-inline')).not.toBeNull();
  });
});
