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
import { delay, graphql, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { useEditorPage } from '../../../src/features/editor/hooks/useEditorPage.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import { seriesAuthority } from '../../seriesAuthority.js';
import goodMe from '../../fixtures/wire/me/good.json';

const ownSeries = '11111111-1111-4111-8111-111111111111';
const otherSeries = '22222222-2222-4222-8222-222222222222';
const draftKey = draftStorageKey('quest', 'new', 'discord-editor', 'new');

/** A complete new-quest draft recovered from this device, so the form can be submitted. */
function seedQuestDraft(
  meta: Record<string, unknown> = {},
  body = 'Descend the salt stair.',
) {
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
        signupType: 'dm_pick',
        arcId: '',
        ...meta,
      },
      body,
      savedAt: '2026-10-25T10:00:00Z',
    }),
  );
}

const seriesOptionsData = () => ({
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
});

function seriesOptions() {
  return graphql.query('EditorSeriesOptions', () =>
    HttpResponse.json(seriesOptionsData()),
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
    const oneShot = screen.getByRole('button', { name: 'One-shot' });
    await userEvent.click(oneShot);
    // The preselected Standard gives way to the first other kind (loop 3 L3).
    expect(standard).toHaveAttribute('aria-pressed', 'false');
    expect(oneShot).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['one_shot']);
    expect(inputs[0]).not.toHaveProperty('arcId');
  });

  it('keeps Standard beside other kinds when the user picks it, and marks picks clearly', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest();
    const standard = await screen.findByRole('button', { name: 'Standard' });
    const oneShot = screen.getByRole('button', { name: 'One-shot' });
    // Selected chips are filled and carry a check mark; unselected ones do not.
    expect(standard).toHaveAttribute('data-selected', '1');
    expect(standard.querySelector('[data-el="editor.chip.check"]')).not.toBeNull();
    expect(oneShot).not.toHaveAttribute('data-selected');
    expect(oneShot.querySelector('[data-el="editor.chip.check"]')).toBeNull();
    await userEvent.click(oneShot);
    await userEvent.click(standard);
    expect(standard).toHaveAttribute('aria-pressed', 'true');
    expect(oneShot).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['one_shot', 'standard']);
  });

  it('keeps an explicitly re-picked Standard when another kind is added', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest();
    const standard = await screen.findByRole('button', { name: 'Standard' });
    await userEvent.click(standard);
    await userEvent.click(standard);
    await userEvent.click(screen.getByRole('button', { name: 'One-shot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].kinds).toEqual(['standard', 'one_shot']);
  });

  it('requires the description and focuses the error summary on Create quest (loop 3 L4, L5)', async () => {
    seedQuestDraft({ durationHours: '' }, '   ');
    const inputs = captureCreate();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderNewQuest();
    expect(await screen.findByText('Description')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    const summary = await screen.findByRole('group', {
      name: 'Fields that need attention',
    });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(scroll).toHaveBeenCalled();
    expect(summary).toHaveTextContent('2 fields need attention');
    expect(summary).toHaveTextContent('Length (hours) — Required');
    expect(summary).toHaveTextContent('Description — Describe the quest for players');
    expect(inputs).toHaveLength(0);
    // A second blocked attempt takes focus back to the summary.
    screen.getByRole('button', { name: 'Create quest' }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Fields that need attention' }),
      ).toHaveFocus(),
    );
    expect(inputs).toHaveLength(0);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('shows field errors for a restored draft with bad numbers (loop 3 L9)', async () => {
    seedQuestDraft({ durationHours: -2, slotsMax: 0 });
    const inputs = captureCreate();
    renderNewQuest();
    await screen.findByRole('status', { name: 'Restored draft' });
    const length = document.querySelector('[data-field="durationHours"]')!;
    const seats = document.querySelector('[data-field="slotsMax"]')!;
    expect(length).toHaveAttribute('data-err', '1');
    expect(length).toHaveTextContent('Must be a positive number');
    expect(seats).toHaveAttribute('data-err', '1');
    expect(seats).toHaveTextContent('Must be a positive whole number');
    // Valid restored fields stay quiet.
    expect(document.querySelector('[data-field="title"]')).toHaveAttribute(
      'data-err',
      '0',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    expect(
      await screen.findByRole('group', { name: 'Fields that need attention' }),
    ).toHaveTextContent('2 fields need attention');
    expect(inputs).toHaveLength(0);
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
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Coastal voyages' }),
    );
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

  it('warns about a linked series the viewer cannot pick and does not send it', async () => {
    seedQuestDraft({ arcId: otherSeries });
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${otherSeries}`);
    expect(
      await screen.findByRole('button', { name: /No series/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You can’t add quests to that series/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).not.toHaveProperty('arcId');
  });

  it('waits for the series to load before a linked series can be created', async () => {
    server.use(
      graphql.query('EditorSeriesOptions', async () => {
        await delay('infinite');
        return HttpResponse.json({ data: null });
      }),
    );
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    const create = await screen.findByRole('button', { name: 'Create quest' });
    expect(await screen.findByText('Loading series…')).toBeInTheDocument();
    expect(create).toBeDisabled();
    await userEvent.click(create);
    expect(inputs).toHaveLength(0);
  });

  it('blocks create while the series failed to load, and creates in the series after a retry', async () => {
    let calls = 0;
    server.use(
      graphql.query('EditorSeriesOptions', () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({
              errors: [{ message: 'down', extensions: { code: 'INTERNAL' } }],
            })
          : HttpResponse.json(seriesOptionsData());
      }),
    );
    seedQuestDraft();
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    expect(
      await screen.findByText(/Your series could not be loaded/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create quest' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Series unavailable/ }));
    expect(
      await screen.findByRole('button', { name: /Coastal voyages/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].arcId).toBe(ownSeries);
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
    expect(
      within(alert).getByRole('link', { name: 'Open your DM profile' }),
    ).toHaveAttribute('href', '/dms/@ashwin?edit=profile');
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

  it('discards a recovered draft and its copy on this device after an in-page confirm', async () => {
    seedQuestDraft({ title: 'Draft from another tab' });
    const confirm = vi.spyOn(window, 'confirm');
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' });
    expect(dialog).toHaveTextContent('This deletes your unsaved draft.');
    expect(dialog).not.toHaveTextContent(/recovery copy|revision|this device/);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Discard draft' }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem(draftKey)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Discard this draft?' })).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
    expect(screen.queryByDisplayValue('Draft from another tab')).toBeNull();
  });

  it('keeps the draft when the discard confirm is cancelled', async () => {
    seedQuestDraft({ title: 'Draft to keep' });
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(localStorage.getItem(draftKey)).toContain('Draft to keep');
    expect(screen.getByDisplayValue('Draft to keep')).toBeInTheDocument();
  });
});

describe('a restored draft and the series in the link', () => {
  beforeEach(() => {
    seedEditorSession();
    server.use(seriesOptions(), seriesAuthority(goodMe.id, 'approved'));
  });

  /** A draft saved before series were offered on the form: no `arcId` at all. */
  function seedOldDraft() {
    seedQuestDraft();
    const stored = JSON.parse(localStorage.getItem(draftKey) ?? '{}');
    delete stored.meta.arcId;
    localStorage.setItem(draftKey, JSON.stringify(stored));
  }

  it('shows the Series field for an old draft and sends the linked series', async () => {
    seedOldDraft();
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    expect(
      await screen.findByRole('button', { name: /Coastal voyages/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].arcId).toBe(ownSeries);
  });

  it('shows the Series field for an old draft without a link', async () => {
    seedOldDraft();
    renderNewQuest();
    expect(
      await screen.findByRole('button', { name: /No series/ }),
    ).toBeInTheDocument();
  });

  it('lets the linked series win over the draft’s series', async () => {
    seedQuestDraft({ arcId: otherSeries });
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: ['player', 'dm', 'admin'] } },
        }),
      ),
    );
    const inputs = captureCreate();
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    expect(
      await screen.findByRole('button', { name: /Coastal voyages/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].arcId).toBe(ownSeries);
  });

  it('keeps the draft’s own series without a link and says the draft was restored', async () => {
    seedQuestDraft({ arcId: ownSeries });
    renderNewQuest();
    expect(
      await screen.findByRole('button', { name: /Coastal voyages/ }),
    ).toBeInTheDocument();
    const notice = screen.getByRole('status', { name: 'Restored draft' });
    expect(notice).toHaveTextContent(
      /^Restored your unsaved draft “The Salt Stair” from .+\.Start fresh$/,
    );
  });

  it('names an untitled draft and says when the link set the series (loop 3 L1)', async () => {
    seedQuestDraft({ title: '', arcId: otherSeries });
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    const notice = await screen.findByRole('status', { name: 'Restored draft' });
    expect(notice).toHaveTextContent(
      /Restored an untitled draft from .+\. The series was set from the link you opened\./,
    );
  });

  it('does not mention the link when the draft already has the linked series', async () => {
    seedQuestDraft({ arcId: ownSeries });
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    const notice = await screen.findByRole('status', { name: 'Restored draft' });
    expect(notice).toHaveTextContent(/“The Salt Stair”/);
    expect(notice).not.toHaveTextContent(/set from the link/);
  });

  it('starts fresh: clears the recovery copy and keeps the linked series', async () => {
    seedQuestDraft({ title: 'Old title', arcId: otherSeries });
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    const notice = await screen.findByRole('status', { name: 'Restored draft' });
    await userEvent.click(within(notice).getByRole('button', { name: 'Start fresh' }));
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(screen.queryByDisplayValue('Old title')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Restored draft' })).toBeNull();
    expect(screen.getByRole('button', { name: /Coastal voyages/ })).toBeInTheDocument();
  });

  it('shows no restore notice without a draft', async () => {
    renderNewQuest(`/quests/new?series=${ownSeries}`);
    await screen.findByRole('button', { name: /Coastal voyages/ });
    expect(screen.queryByRole('status', { name: 'Restored draft' })).toBeNull();
  });

  it('says that creating the quest posts it to Discord', async () => {
    renderNewQuest();
    await screen.findByRole('button', { name: 'Create quest' });
    expect(
      screen.getByText('Creating the quest posts it to the community Discord.'),
    ).toBeInTheDocument();
  });
});

describe('client-side validation on create', () => {
  beforeEach(() => {
    seedEditorSession();
    server.use(seriesOptions(), seriesAuthority(goodMe.id, 'approved'));
  });

  it('shows field hints without calling the API or the recovery prompt, and clears them as fields become valid', async () => {
    const inputs = captureCreate();
    seedQuestDraft({ title: '', regions: [] });
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    expect(await screen.findByText('2 fields need attention')).toBeInTheDocument();
    expect(inputs).toHaveLength(0);
    expect(screen.queryByText('Title is required')).toBeNull();
    expect(screen.queryByText(/recovery copy/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Discard local edits and reload' }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.type(screen.getByPlaceholderText('Quest title'), 'Named');
    expect(await screen.findByText('1 field needs attention')).toBeInTheDocument();
    expect(inputs).toHaveLength(0);
  });

  it('keeps the recovery prompt for a conflicting save', async () => {
    seedQuestDraft();
    captureCreate(() =>
      HttpResponse.json({
        errors: [{ message: 'conflict', extensions: { code: 'CONFLICT' } }],
      }),
    );
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Discard local edits and reload' }),
    ).toBeInTheDocument();
  });

  it('shows no recovery prompt for a refused field', async () => {
    seedQuestDraft();
    captureCreate(() =>
      HttpResponse.json({
        errors: [{ message: 'title too long', extensions: { code: 'INVALID' } }],
      }),
    );
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Discard local edits and reload' }),
    ).toBeNull();
  });
});

describe('typing quickly into the quest form', () => {
  beforeEach(() => {
    seedEditorSession();
    server.use(seriesOptions(), seriesAuthority(goodMe.id, 'approved'));
  });

  it('saves every keystroke of the title and the description', async () => {
    seedQuestDraft({ title: '' });
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(draftKey) ?? '{}'),
        body: '',
      }),
    );
    const inputs = captureCreate();
    const user = userEvent.setup({ delay: null });
    renderNewQuest();
    const title = await screen.findByPlaceholderText('Quest title');
    await user.type(title, 'Edited after posting');
    fireEvent.mouseDown(screen.getByText('Describe the quest for players…'));
    const body = await screen.findByRole('textbox', { name: 'Document body' });
    await user.type(body, 'created from the quest board');
    await user.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0].title).toBe('Edited after posting');
    expect(String(inputs[0].briefBody).trim()).toBe('created from the quest board');
  });
});

describe('the DM approval notice on a new quest', () => {
  beforeEach(seedEditorSession);

  it.each([
    ['pending', /pending review/],
    ['rejected', /rejected/],
    ['draft', /not submitted for review yet/],
  ])(
    'names a %s profile and links to the editor before the form is filled',
    async (status, copy) => {
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
      expect(
        within(notice).getByRole('link', { name: 'Open your DM profile' }),
      ).toHaveAttribute('href', '/dms/@ashwin?edit=profile');
    },
  );

  it('stays hidden for an approved DM', async () => {
    server.use(seriesAuthority(goodMe.id, 'approved'));
    renderNewQuest();
    await screen.findByRole('button', { name: 'Create quest' });
    expect(screen.queryByRole('status', { name: 'DM profile approval' })).toBeNull();
  });
});

describe('a new quest’s expected destinations', () => {
  const questId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const hex = '44444444-4444-4444-8444-444444444444';
  const mapOptions = () =>
    graphql.query('EditorMapOptions', () =>
      HttpResponse.json({
        data: {
          maps: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              atlasCode: 'LF-HEX',
              name: 'Lightfall Hexflower',
              canEdit: false,
            },
          ],
        },
      }),
    );
  const nodeOptions = () =>
    graphql.query('EditorMapPlaces', () =>
      HttpResponse.json({
        data: {
          map: {
            id: '55555555-5555-4555-8555-555555555555',
            atlasCode: 'LF-HEX',
            name: 'Lightfall Hexflower',
            canEdit: false,
            pointcrawlNodes: [
              { id: hex, name: 'LFR7008' },
              { id: '66666666-6666-4666-8666-666666666666', name: 'LFR7009' },
            ],
          },
        },
      }),
    );
  function captureLinks(fail = false) {
    const calls: { questId: unknown; links: unknown; key: unknown }[] = [];
    server.use(
      graphql.mutation('EditorSetQuestPlaces', ({ variables }) => {
        calls.push({
          questId: variables.questId,
          links: variables.links,
          key: (variables.meta as { idempotencyKey?: string }).idempotencyKey,
        });
        if (fail) return HttpResponse.json({ errors: [{ message: 'down' }] });
        return HttpResponse.json({ data: { setQuestPointcrawlLinks: variables.links } });
      }),
    );
    return calls;
  }
  beforeEach(() => {
    seedEditorSession();
    server.use(
      seriesOptions(),
      seriesAuthority(goodMe.id, 'approved'),
      mapOptions(),
      nodeOptions(),
    );
  });

  it('finds a hex by name and saves it as an expected destination after create', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    const links = captureLinks();
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: /^Pointcrawl map/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lightfall Hexflower' }));
    await userEvent.type(await screen.findByLabelText('Find a place'), '7008');
    expect(screen.queryByText('LFR7009')).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Expected destination' }));
    // The map in this fixture isn't one this DM owns (canEdit: false), so Visited is
    // offered (a new quest may mark places visited, same as an edited one) but disabled.
    expect(screen.getByRole('checkbox', { name: 'Visited' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(links).toHaveLength(1));
    expect(inputs).toHaveLength(1);
    expect(links[0]).toMatchObject({
      questId,
      links: [{ pointcrawlNodeId: hex, role: 'expected' }],
    });
  });

  it('lets a DM who owns the map mark a new quest’s destination visited', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    const links = captureLinks();
    server.use(
      graphql.query('EditorMapOptions', () =>
        HttpResponse.json({
          data: {
            maps: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                atlasCode: 'LF-HEX',
                name: 'Lightfall Hexflower',
                canEdit: true,
              },
            ],
          },
        }),
      ),
      graphql.query('EditorMapPlaces', () =>
        HttpResponse.json({
          data: {
            map: {
              id: '55555555-5555-4555-8555-555555555555',
              atlasCode: 'LF-HEX',
              name: 'Lightfall Hexflower',
              canEdit: true,
              pointcrawlNodes: [
                { id: hex, name: 'LFR7008' },
                { id: '66666666-6666-4666-8666-666666666666', name: 'LFR7009' },
              ],
            },
          },
        }),
      ),
    );
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: /^Pointcrawl map/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lightfall Hexflower' }));
    await userEvent.type(await screen.findByLabelText('Find a place'), '7008');
    const visited = screen.getByRole('checkbox', { name: 'Visited' });
    expect(visited).not.toBeDisabled();
    await userEvent.click(visited);
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(links).toHaveLength(1));
    expect(inputs).toHaveLength(1);
    expect(links[0]).toMatchObject({
      questId,
      links: [{ pointcrawlNodeId: hex, role: 'visited' }],
    });
  });

  it('creates without a places call when none are chosen', async () => {
    seedQuestDraft();
    const inputs = captureCreate();
    const links = captureLinks();
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(links).toHaveLength(0);
  });

  it('says the quest exists when its places fail, and a retry sends only the same places', async () => {
    seedQuestDraft({ pointcrawlLinks: [{ pointcrawlNodeId: hex, role: 'expected' }] });
    const keys: unknown[] = [];
    server.use(
      graphql.mutation('CreateQuest', ({ variables }) => {
        keys.push((variables.meta as { idempotencyKey?: string }).idempotencyKey);
        return HttpResponse.json({
          data: {
            createQuest: { id: questId, shortCode: 'Q-NEW', updatedAt: '2026-10-15T18:00:00Z' },
          },
        });
      }),
    );
    const links = captureLinks(true);
    renderNewQuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Create quest' }));
    expect(
      await screen.findByText(/The quest was created, but its expected destinations were not saved/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create quest' }));
    await waitFor(() => expect(links).toHaveLength(2));
    expect(keys).toHaveLength(1);
    expect(links[1]!.key).toBe(links[0]!.key);
  });

  it.each([
    ['a different', 'A different quest', 'Climb the bell tower.'],
    ['an identical', 'The Salt Stair', 'Descend the salt stair.'],
  ])('creates %s new quest after a discarded draft whose places failed', async (_, title, body) => {
    seedQuestDraft({ pointcrawlLinks: [{ pointcrawlNodeId: hex, role: 'expected' }] });
    const keys: unknown[] = [];
    server.use(
      graphql.mutation('CreateQuest', ({ variables }) => {
        keys.push((variables.meta as { idempotencyKey?: string }).idempotencyKey);
        return HttpResponse.json({
          data: {
            createQuest: { id: questId, shortCode: 'Q-NEW', updatedAt: '2026-10-15T18:00:00Z' },
          },
        });
      }),
    );
    captureLinks(true);
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'quest', mode: 'new' }),
      editorHarness('/quests/new', '/quests/new'),
    );
    const view = () => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      return result.current.view;
    };
    await waitFor(() => expect(view().saveDisabled).toBe(false));
    const startingMeta = view().meta;
    act(() => view().onPublish());
    await waitFor(() =>
      expect(view().mutationError?.userMessage).toMatch(
        /The quest was created, but its expected destinations were not saved/,
      ),
    );
    act(() => view().onDiscardDraft?.());
    act(() => view().acceptConfirm());
    act(() => {
      view().setMeta({ ...startingMeta, title });
      view().setBody(body);
    });
    act(() => view().onPublish());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });
});
