import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import { seriesAuthority } from '../../seriesAuthority.js';
import goodMe from '../../fixtures/wire/me/good.json';

const ownSeries = '11111111-1111-4111-8111-111111111111';
const otherSeries = '22222222-2222-4222-8222-222222222222';
const draftKey = draftStorageKey('quest', 'new', 'discord-editor', 'new');

/** A complete new-quest draft recovered from this device, so the form can be submitted. */
function seedQuestDraft(meta: Record<string, unknown> = {}) {
  localStorage.setItem(
    draftKey,
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
        signupType: 'open',
        arcId: '',
        ...meta,
      },
      body: 'Descend the salt stair.',
      savedAt: '2026-10-25T10:00:00Z',
    }),
  );
}

function seriesOptions() {
  return graphql.query('EditorSeriesOptions', () =>
    HttpResponse.json({
      data: {
        questArcs: {
          total: 2,
          items: [
            { id: ownSeries, name: 'Coastal voyages', createdBy: goodMe.id },
            {
              id: otherSeries,
              name: 'Someone else’s series',
              createdBy: '33333333-3333-4333-8333-333333333333',
            },
          ],
        },
      },
    }),
  );
}

function captureCreate(
  respond: () => Response = () =>
    HttpResponse.json({
      data: {
        createQuest: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          shortCode: 'Q-NEW',
          updatedAt: '2026-10-15T18:00:00Z',
        },
      },
    }),
) {
  const inputs: Record<string, unknown>[] = [];
  server.use(
    graphql.mutation('CreateQuest', ({ variables }) => {
      inputs.push(variables.input as Record<string, unknown>);
      return respond();
    }),
  );
  return inputs;
}

function renderNewQuest(route = '/quests/new') {
  return render(<EditorRoute typeKey="quest" mode="new" />, {
    wrapper: editorHarness(route, '/quests/new').wrapper,
  });
}

describe('creating a quest', () => {
  beforeEach(() => {
    seedEditorSession();
    server.use(seriesOptions(), seriesAuthority(goodMe.id, 'approved'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the kinds the chips select, in the database vocabulary', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest();
    const standard = await screen.findByRole('button', { name: 'Standard' });
    expect(standard).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'One-shot' }));
    await userEvent.click(standard);
    expect(standard).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['one_shot']);
    expect(inputs[0]).not.toHaveProperty('arcId');
  });

  it('sends Standard alone when it is the only kind', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['standard']);
  });

  it('offers only the viewer’s own series and sends the chosen one', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: /No series/ }));
    expect(
      screen.queryByRole('menuitem', { name: 'Someone else’s series' }),
    ).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Coastal voyages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].arcId).toBe(ownSeries);
  });

  it('pre-selects the series named in the link from a series page', async () => {
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    expect(
      await screen.findByRole('button', { name: /Coastal voyages/ }),
    ).toBeInTheDocument();
  });

  it('does not send a linked series the viewer cannot pick, and shows No series', async () => {
    seedQuestDraft({ arcId: otherSeries });
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${otherSeries}`);
    expect(await screen.findByRole('button', { name: /No series/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).not.toHaveProperty('arcId');
  });

  it('offers an admin other DMs’ series, labelled, and sends the linked one', async () => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: ['player', 'dm', 'admin'] } },
        }),
      ),
    );
    seedQuestDraft({ arcId: otherSeries });
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${otherSeries}`);
    expect(
      await screen.findByRole('button', {
        name: /Someone else’s series \(another DM’s series\)/,
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].arcId).toBe(otherSeries);
  });

  it('maps old kind names in a recovered draft to the current vocabulary', async () => {
    seedQuestDraft({ kinds: ['oneshot', 'series', 'social', 'beginner'] });
    const inputs = captureCreate();
    renderNewQuest();
    const oneShot = await screen.findByRole('button', { name: 'One-shot' });
    expect(oneShot).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['one_shot']);
  });

  it('defaults a fresh form to a session at least a day ahead, on the hour', async () => {
    const before = Date.now();
    renderNewQuest();
    await screen.findByRole('button', { name: 'Create quest' });
    const draft = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
    // Nothing is saved until the form is edited.
    expect(draft).toBeNull();
    const session = screen.getByLabelText('Session') as HTMLInputElement;
    expect(session.value).toMatch(/T\d\d:00$/);
    const chosen = Date.parse(`${session.value}:00Z`);
    // The test zone is UTC, so the civil value reads as an instant.
    expect(chosen - before).toBeGreaterThanOrEqual(24 * 3600_000);
    expect(chosen - before).toBeLessThan(25 * 3600_000);
  });

  it('explains a refusal for an unapproved DM profile and links to the profile', async () => {
    seedQuestDraft();
    captureCreate(() =>
      HttpResponse.json({
        errors: [
          {
            message: 'quest DM must be active and approved',
            extensions: { code: 'FORBIDDEN' },
          },
        ],
      }),
    );
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Your DM profile must be approved before you can post quests.',
    );
    expect(within(alert).getByRole('link', { name: 'Open your DM profile' })).toHaveAttribute(
      'href',
      '/dms/@ashwin?edit=profile',
    );
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('shows the server’s reason when the quest is invalid', async () => {
    seedQuestDraft();
    captureCreate(() =>
      HttpResponse.json({
        errors: [
          {
            message: 'unknown quest kind "oneshot"; allowed kinds: standard, event',
            extensions: { code: 'INVALID' },
          },
        ],
      }),
    );
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The quest was not saved: Unknown quest kind "oneshot"; allowed kinds: standard, event.',
    );
  });

  it('explains a refusal for a series the viewer may not use', async () => {
    seedQuestDraft({ arcId: ownSeries });
    captureCreate(() =>
      HttpResponse.json({
        errors: [
          {
            message:
              'you can add a quest only to a series you started; an admin may use any series',
            extensions: { code: 'FORBIDDEN' },
          },
        ],
      }),
    );
    renderNewQuest();
    await screen.findByRole('button', { name: /Coastal voyages/ });
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'you can add a quest only to a series you started',
    );
  });

  it('discards a recovered draft and its copy on this device', async () => {
    seedQuestDraft({ title: 'Draft from another tab' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
    expect(screen.queryByDisplayValue('Draft from another tab')).toBeNull();
  });
});

describe('the DM approval notice on a new quest', () => {
  beforeEach(seedEditorSession);

  it.each([
    ['pending', /pending review/],
    ['rejected', /rejected/],
    ['draft', /not submitted for review yet/],
  ])('names a %s profile and links to the editor before the form is filled', async (status, copy) => {
    server.use(
      seriesAuthority(goodMe.id, status),
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
    renderNewQuest();
    const notice = await screen.findByRole('status', { name: 'DM profile approval' });
    expect(notice).toHaveTextContent(copy);
    expect(notice).toHaveTextContent('you can’t post quests or start a series');
    expect(within(notice).getByRole('link', { name: 'Open your DM profile' })).toHaveAttribute(
      'href',
      '/dms/@ashwin?edit=profile',
    );
  });

  it('stays hidden for an approved DM', async () => {
    server.use(seriesAuthority(goodMe.id, 'approved'));
    renderNewQuest();
    await screen.findByRole('button', { name: 'Create quest' });
    expect(screen.queryByRole('status', { name: 'DM profile approval' })).toBeNull();
  });
});
