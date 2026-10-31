import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { EditorWorkspace } from '../../../src/features/editor/EditorWorkspace.js';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import type { BodySpanAudit } from '../../../src/features/editor/adapters/bodyAudit.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import { seriesAuthority } from '../../seriesAuthority.js';
import goodMe from '../../fixtures/wire/me/good.json';

const auditBody = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/editor/adapters/bodyAudit.js', () => ({ auditBody }));

const TYPO_BODY = [
  'Intro line',
  '> [!dm@mortal] The mayor leads the cult.',
  '',
  '> [!dm:mortal]',
  '> A typo hides this from everyone.',
].join('\n');

const TYPO_SPANS: BodySpanAudit[] = [
  {
    startLine: 4,
    endLine: 5,
    kind: 'MALFORMED',
    handle: null,
    suggestion: '[!dm:@mortal]',
    token: '[!dm:mortal]',
    tokenLine: 4,
    tokenColumn: 3,
  },
  {
    startLine: 2,
    endLine: 2,
    kind: 'LOOKALIKE',
    handle: null,
    suggestion: '[!dm:@mortal]',
    token: '[!dm@mortal]',
    tokenLine: 2,
    tokenColumn: 3,
  },
];

const source: EditorLoadResult = {
  meta: { title: 'Published guide', slug: 'published-guide', category: 'guide' },
  body: TYPO_BODY,
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

function countWrites() {
  const writes: unknown[] = [];
  server.use(
    graphql.mutation('EditPublishedDocument', ({ variables }) => {
      writes.push(variables.input);
      return HttpResponse.json({
        data: {
          editPublishedDocument: { id: source.documentId, slug: 'published-guide', version: 8 },
        },
      });
    }),
  );
  return writes;
}

function Workspace({ initial }: { initial: EditorLoadResult }): React.JSX.Element {
  const view = useEditorWorkspace({
    typeKey: 'guide',
    mode: 'edit',
    initial,
    enabled: true,
    timeZone: 'UTC',
    actorId: 'guard-owner',
  });
  return <EditorWorkspace view={view} />;
}

function renderGuide(initial: EditorLoadResult = source) {
  return render(
    <Workspace initial={initial} />,
    editorHarness('/rules/guides/published-guide/edit', '*'),
  );
}

beforeEach(() => {
  auditBody.mockReset();
  auditBody.mockImplementation(async (body: string) => (body === TYPO_BODY ? TYPO_SPANS : []));
});

describe('publishing with marker typos', () => {
  it('requires confirmation for list-nested marker warnings', async () => {
    const body = '- > [!dm]\n  > secret';
    auditBody.mockResolvedValue([
      {
        startLine: 1,
        endLine: 1,
        kind: 'LIST_NESTED',
        handle: null,
        suggestion: null,
        token: '[!dm]',
        tokenLine: 1,
        tokenColumn: 5,
      } satisfies BodySpanAudit,
    ]);
    const writes = countWrites();
    renderGuide({ ...source, body: 'Old body' });
    renderGuideBody(body);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    let dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    expect(within(dialog).getByRole('listitem')).toHaveTextContent(
      'does not protect the whole list item',
    );
    expect(writes).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Check hidden text' })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ body });
  });

  it('asks first, listing each offending line, and "Publish anyway" publishes', async () => {
    const writes = countWrites();
    renderGuide({ ...source, body: 'Old body' });
    // A changed body is checked by its own audit before publishing.
    renderGuideBody(TYPO_BODY);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    const items = within(dialog).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Line 2: > [!dm@mortal] The mayor leads the cult. — players will see this',
      'Line 4: > [!dm:mortal] — hidden from everyone',
    ]);
    expect(writes).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.queryByRole('dialog', { name: 'Check hidden text' })).not.toBeInTheDocument();
  });

  it('"Fix" closes the dialog and puts the caret on the first offending line', async () => {
    const writes = countWrites();
    renderGuide({ ...source, body: 'Old body' });
    renderGuideBody(TYPO_BODY);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fix' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Check hidden text' })).not.toBeInTheDocument(),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await waitFor(() => {
      const input = screen.getByRole('textbox', { name: 'Document body' });
      expect(input).toHaveValue('> [!dm@mortal] The mayor leads the cult.');
      expect(input).toHaveFocus();
    });
    expect(writes).toHaveLength(0);
  });

  it('publishes without asking when the audit cannot be had', async () => {
    auditBody.mockRejectedValue(new Error('audit down'));
    const writes = countWrites();
    renderGuide({ ...source, body: 'Old body' });
    renderGuideBody(TYPO_BODY);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.queryByRole('dialog', { name: 'Check hidden text' })).not.toBeInTheDocument();
  });

  it('waits for the audit of the body as it is when Publish is pressed', async () => {
    const writes = countWrites();
    let release!: () => void;
    auditBody.mockImplementation((body: string) =>
      body === TYPO_BODY
        ? new Promise<BodySpanAudit[]>((resolve) => {
            release = () => resolve(TYPO_SPANS);
          })
        : Promise.resolve([]),
    );
    const { result } = renderHook(
      () =>
        useEditorWorkspace({
          typeKey: 'guide',
          mode: 'edit',
          initial: { ...source, body: 'Clean body' },
          enabled: true,
          timeZone: 'UTC',
          actorId: 'fresh-owner',
        }),
      editorHarness('/rules/guides/published-guide/edit', '*'),
    );
    await waitFor(() => expect(auditBody).toHaveBeenCalledWith('Clean body', expect.anything()));
    act(() => result.current.setBody(TYPO_BODY));
    act(() => result.current.onPublish());
    await waitFor(() => expect(auditBody).toHaveBeenCalledWith(TYPO_BODY, expect.anything()));
    expect(result.current.typoCheck).toBeNull();
    expect(writes).toHaveLength(0);
    await act(async () => release());
    await waitFor(() => expect(result.current.typoCheck?.items).toHaveLength(2));
    expect(writes).toHaveLength(0);
  });
});

describe('while markers are being checked', () => {
  it('locks publishing and the body, shows progress, and rechecks text typed meanwhile', async () => {
    const writes = countWrites();
    let release!: () => void;
    auditBody.mockImplementation((body: string) =>
      body === 'Clean body'
        ? new Promise<BodySpanAudit[]>((resolve) => {
            release = () => resolve([]);
          })
        : Promise.resolve(body === TYPO_BODY ? TYPO_SPANS : []),
    );
    const { result } = renderHook(
      () =>
        useEditorWorkspace({
          typeKey: 'guide',
          mode: 'edit',
          initial: { ...source, body: 'Clean body' },
          enabled: true,
          timeZone: 'UTC',
          actorId: 'typing-owner',
        }),
      editorHarness('/rules/guides/published-guide/edit', '*'),
    );
    act(() => result.current.onPublish());
    await waitFor(() => expect(result.current.checkingMarkers).toBe(true));
    expect(result.current.publishDisabled).toBe(true);
    expect(result.current.saveDisabled).toBe(true);
    // Text that still changes while the check waits is checked again, not published.
    act(() => result.current.setBody(TYPO_BODY));
    await act(async () => release());
    await waitFor(() => expect(result.current.typoCheck?.items).toHaveLength(2));
    expect(result.current.checkingMarkers).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('shows "Checking markers…" and makes the editor inert until the audit answers', async () => {
    const writes = countWrites();
    let release!: () => void;
    renderGuide({ ...source, body: 'Old body' });
    auditBody.mockImplementation(
      () =>
        new Promise<BodySpanAudit[]>((resolve) => {
          release = () => resolve([]);
        }),
    );
    renderGuideBody('New body');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Checking markers…')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(document.querySelector('[data-el="editor.body.lock"]')).toHaveAttribute('inert');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => release());
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.queryByText('Checking markers…')).not.toBeInTheDocument();
  });

  it('ignores Ctrl+S behind the typo dialog, so "Publish anyway" still saves and publishes', async () => {
    const calls: string[] = [];
    server.use(
      graphql.mutation('UpdateDocument', () => {
        calls.push('update');
        return HttpResponse.json({
          data: { updateDocument: { id: 'draft-guide', slug: 'draft-guide', version: 2 } },
        });
      }),
      graphql.mutation('PublishDocument', () => {
        calls.push('publish');
        return HttpResponse.json({
          data: { publishDocument: { id: 'draft-guide', slug: 'draft-guide', version: 3 } },
        });
      }),
    );
    renderGuide({
      ...source,
      status: 'draft',
      briefPublished: false,
      recordId: 'draft-guide',
      documentId: 'draft-guide',
      documentVersion: 1,
      body: 'Old body',
    });
    renderGuideBody(TYPO_BODY);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Fix' }), {
      key: 's',
      ctrlKey: true,
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(calls).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(calls).toEqual(['update', 'publish']));
    expect(screen.queryByText('A save is already in progress.')).not.toBeInTheDocument();
  });
});

/** Replaces the body through the editor, as pasting a block over the first line would. */
function renderGuideBody(body: string) {
  const first = document.querySelector('.le-doc > .le-row .le-read') as Element;
  fireEvent.mouseDown(first);
  fireEvent.change(screen.getByRole('textbox', { name: 'Document body' }), {
    target: { value: body },
  });
  fireEvent.keyDown(screen.getAllByRole('textbox', { name: 'Document body' })[0], {
    key: 'Escape',
  });
}

describe('creating a quest with marker typos', () => {
  beforeEach(() => {
    seedEditorSession();
    server.use(
      graphql.query('EditorSeriesOptions', () =>
        HttpResponse.json({ data: { questArcs: { items: [], total: 0 } } }),
      ),
      seriesAuthority(goodMe.id, 'approved'),
    );
  });

  it('asks before posting the quest, then creates it on "Publish anyway"', async () => {
    localStorage.setItem(
      draftStorageKey('quest', 'new', 'discord-editor', 'new'),
      JSON.stringify({
        meta: {
          title: 'The Salt Stair',
          durationHours: '3',
          slotsMax: '4',
          scheduledAt: '2030-01-01T18:00:00Z',
          kinds: ['standard'],
          regions: ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'],
          genres: [],
          tags: [],
          signupType: 'dm_pick',
          arcId: '',
        },
        body: TYPO_BODY,
        savedAt: '2026-10-25T10:00:00Z',
      }),
    );
    const created: unknown[] = [];
    server.use(
      graphql.mutation('CreateQuest', ({ variables }) => {
        created.push(variables.input);
        return HttpResponse.json({
          data: {
            createQuest: {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              shortCode: 'Q-NEW',
              updatedAt: '2026-10-15T18:00:00Z',
            },
          },
        });
      }),
    );
    render(<EditorRoute typeKey="quest" mode="new" />, {
      wrapper: editorHarness('/quests/new', '*').wrapper,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check hidden text' });
    expect(created).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ briefBody: TYPO_BODY });
  });
});
