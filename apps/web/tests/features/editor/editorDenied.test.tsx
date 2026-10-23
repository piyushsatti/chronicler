import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import goodMe from '../../fixtures/wire/me/good.json';

function questWire(rights: { canEditMetadata: boolean; canEditBody: boolean }) {
  return {
    id: 'quest-1',
    shortCode: 'Q-1',
    scheduledAt: '2026-10-15T18:00:00Z',
    durationHours: 3,
    slotsMax: 4,
    updatedAt: '2026-10-15T17:00:00Z',
    briefDocument: {
      id: 'doc-1',
      title: 'The Salt Stair',
      version: 1,
      effectiveBody: 'Loaded body',
      ...rights,
    },
  };
}

function renderQuestEditor(rights: { canEditMetadata: boolean; canEditBody: boolean }) {
  server.use(
    graphql.query('EditorQuestLoad', () =>
      HttpResponse.json({ data: { quest: questWire(rights) } }),
    ),
  );
  return render(<EditorRoute typeKey="quest" mode="edit" />, {
    wrapper: editorHarness().wrapper,
  });
}

describe('quest editor without edit rights', () => {
  beforeEach(seedEditorSession);

  it('shows a designed denial with a way back instead of an inert editor', async () => {
    renderQuestEditor({ canEditMetadata: false, canEditBody: false });
    expect(
      await screen.findByRole('heading', { name: 'You can’t edit this quest' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Only the quest’s DM and admins can change it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the quest' })).toHaveAttribute(
      'href',
      '/quests/Q-1',
    );
    expect(screen.queryByRole('button', { name: 'Save quest' })).toBeNull();
    expect(screen.queryByText(/Body editing is currently unavailable/)).toBeNull();
    // The page title names the quest; it does not promise an edit.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'The Salt Stair',
    );
    expect(screen.queryByRole('heading', { name: 'Edit quest' })).toBeNull();
  });

  it('keeps the editor for someone the server lets edit', async () => {
    renderQuestEditor({ canEditMetadata: true, canEditBody: true });
    expect(
      await screen.findByRole('button', { name: 'Save quest' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You can’t edit this quest' }),
    ).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit quest' })).toBeVisible();
  });

  it('tells an admin a quest without a brief has nothing to edit, not that they lack rights', async () => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: { ...goodMe, roles: ['admin'] } } }),
      ),
      graphql.query('EditorQuestLoad', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...questWire({ canEditMetadata: false, canEditBody: false }),
              briefDocument: null,
            },
          },
        }),
      ),
    );
    render(<EditorRoute typeKey="quest" mode="edit" />, {
      wrapper: editorHarness().wrapper,
    });
    expect(
      await screen.findByRole('heading', {
        name: 'This quest has no brief to edit yet',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You can’t edit this quest' }),
    ).toBeNull();
    expect(
      screen.queryByText('Only the quest’s DM and admins can change it.'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the quest' })).toHaveAttribute(
      'href',
      '/quests/Q-1',
    );
    expect(screen.queryByRole('button', { name: 'Save quest' })).toBeNull();
  });
});

function asRoles(roles: string[]) {
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({ data: { memberMe: { ...goodMe, roles } } }),
    ),
  );
}

function reviewProof(allowed: boolean) {
  server.use(
    graphql.query('CurrentReviewAccess', () =>
      allowed
        ? HttpResponse.json({ data: { pendingDmProfileVerifications: { total: 0 } } })
        : HttpResponse.json({
            errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
          }),
    ),
  );
}

describe('starting a record the account may not create', () => {
  beforeEach(seedEditorSession);

  it('denies a DM without review proof a new guide and points back to the rules', async () => {
    asRoles(['player', 'dm']);
    reviewProof(false);
    render(<EditorRoute typeKey="guide" mode="new" />, {
      wrapper: editorHarness('/rules/guides/new', '/rules/guides/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t write guides' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New guide');
    expect(screen.getByRole('link', { name: 'Back to rules' })).toHaveAttribute(
      'href',
      '/rules',
    );
    expect(screen.queryByRole('link', { name: 'Switch account' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('denies a player a new ruling', async () => {
    asRoles(['player']);
    reviewProof(false);
    render(<EditorRoute typeKey="ruling" mode="new" />, {
      wrapper: editorHarness('/rules/rulings/new', '/rules/rulings/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t record rulings' }),
    ).toBeInTheDocument();
  });

  it('lets an account with review proof write a guide', async () => {
    asRoles(['player', 'verifier']);
    reviewProof(true);
    render(<EditorRoute typeKey="guide" mode="new" />, {
      wrapper: editorHarness('/rules/guides/new', '/rules/guides/new').wrapper,
    });
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'New guide' })).toBeVisible();
  });

  it('surfaces a failed account lookup on a new guide with a working retry, not an endless load', async () => {
    let fail = true;
    server.use(
      graphql.query('MemberMe', () =>
        fail
          ? HttpResponse.json({ errors: [{ message: 'upstream unavailable' }] })
          : HttpResponse.json({
              data: { memberMe: { ...goodMe, roles: ['player', 'verifier'] } },
            }),
      ),
    );
    reviewProof(true);
    const user = userEvent.setup();
    render(<EditorRoute typeKey="guide" mode="new" />, {
      wrapper: editorHarness('/rules/guides/new', '/rules/guides/new').wrapper,
    });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('status', { busy: true })).toBeNull();
    fail = false;
    await user.click(retry);
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('denies a player a DM table and keeps it for a DM', async () => {
    asRoles(['player']);
    const first = render(<EditorRoute typeKey="dm-table" mode="new" />, {
      wrapper: editorHarness('/editor/dm-table', '/editor/dm-table').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t create a DM table' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to DMs' })).toHaveAttribute(
      'href',
      '/dms',
    );
    first.unmount();

    asRoles(['player', 'dm']);
    render(<EditorRoute typeKey="dm-table" mode="new" />, {
      wrapper: editorHarness('/editor/dm-table', '/editor/dm-table').wrapper,
    });
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  function dmProfile(status: string) {
    server.use(
      graphql.query('QuestAuthoringAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: goodMe.id, roles: ['dm'], status: 'active' },
              dmProfile: { status },
            },
          },
        }),
      ),
    );
  }

  it('denies a new quest to a DM whose profile is not approved, as the API does', async () => {
    asRoles(['dm']);
    dmProfile('pending');
    render(<EditorRoute typeKey="quest" mode="new" />, {
      wrapper: editorHarness('/quests/new', '/quests/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t post quests' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/approved DM profile/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('opens a new quest for a DM whose profile is approved', async () => {
    asRoles(['dm']);
    dmProfile('approved');
    render(<EditorRoute typeKey="quest" mode="new" />, {
      wrapper: editorHarness('/quests/new', '/quests/new').wrapper,
    });
    expect(
      await screen.findByRole('button', { name: 'Create quest' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'You can’t post quests' })).toBeNull();
  });

  it('gates a new summary on player, LiveDM or admin', async () => {
    asRoles(['dm']);
    dmProfile('pending');
    const pending = render(<EditorRoute typeKey="summary" mode="new" />, {
      wrapper: editorHarness('/summaries/new', '/summaries/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t write session summaries' }),
    ).toBeInTheDocument();
    pending.unmount();

    asRoles(['player']);
    const player = render(<EditorRoute typeKey="summary" mode="new" />, {
      wrapper: editorHarness('/summaries/new', '/summaries/new').wrapper,
    });
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    player.unmount();

    asRoles([]);
    render(<EditorRoute typeKey="summary" mode="new" />, {
      wrapper: editorHarness('/summaries/new', '/summaries/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t write session summaries' }),
    ).toBeInTheDocument();
  });

  it('denies a player a new quest', async () => {
    asRoles(['player']);
    render(<EditorRoute typeKey="quest" mode="new" />, {
      wrapper: editorHarness('/quests/new', '/quests/new').wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'You can’t post quests' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to quests' })).toHaveAttribute(
      'href',
      '/quests',
    );
  });
});

describe('editing a record that does not exist', () => {
  beforeEach(seedEditorSession);

  it('names the missing DM table and offers a way back and a fresh start', async () => {
    server.use(
      graphql.query('EditorDocumentById', () =>
        HttpResponse.json({ data: { documentById: null } }),
      ),
    );
    render(<EditorRoute typeKey="dm-table" mode="edit" />, {
      wrapper: editorHarness(
        '/editor/dm-table/cccccccc-cccc-4ccc-8ccc-cccccccccccc/edit',
        '/editor/dm-table/:id/edit',
      ).wrapper,
    });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'DM table not found',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to DMs' })).toHaveAttribute(
      'href',
      '/dms',
    );
    expect(screen.getByRole('link', { name: 'Create a DM table' })).toHaveAttribute(
      'href',
      '/editor/dm-table',
    );
  });

  it('does not offer a player a DM table the editor would refuse', async () => {
    asRoles(['player']);
    server.use(
      graphql.query('EditorDocumentById', () =>
        HttpResponse.json({ data: { documentById: null } }),
      ),
    );
    render(<EditorRoute typeKey="dm-table" mode="edit" />, {
      wrapper: editorHarness(
        '/editor/dm-table/cccccccc-cccc-4ccc-8ccc-cccccccccccc/edit',
        '/editor/dm-table/:id/edit',
      ).wrapper,
    });
    expect(
      await screen.findByRole('heading', { name: 'DM table not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to DMs' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Create a DM table' })).toBeNull();
  });
});
