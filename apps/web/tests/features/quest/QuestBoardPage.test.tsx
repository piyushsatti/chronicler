import { graphql, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { QuestBoardPage } from '../../../src/features/quest/pages/QuestBoardPage.js';
import { server } from '../../../src/mocks/server.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';
import listGood from '../../fixtures/wire/quest/list-good.json';
import recruitment from '../../fixtures/wire/quest/board-recruitment.json';
import { renderWithProviders } from '../../test-utils.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function installIntersectionHarness(): () => void {
  const callbacks: IntersectionObserverCallback[] = [];
  class TestObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '160px 0px';
    readonly thresholds = [0];
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', TestObserver);
  return () => callbacks.at(-1)?.(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

function visibleQuestTitles() {
  return screen
    .getAllByRole('article')
    .map((card) => within(card).getByTestId('qboard-title').textContent);
}

describe('QuestBoardPage', () => {
  it('disambiguates generic DM names across quest cards', async () => {
    const genericDms = {
      ...recruitment,
      items: recruitment.items.map((item) => ({
        ...item,
        dm: { ...item.dm, displayName: 'dev' },
      })),
    };
    server.use(
      graphql.query('QuestList', () =>
        HttpResponse.json({ data: { quests: genericDms } }),
      ),
    );
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('The Hound of Culann');
    const cardFor = (title: string) =>
      screen.getAllByTestId('quest-card').find((card) =>
        within(card).queryByText(title),
      );
    expect(within(cardFor("Lily's Nightmares")!).getByText('dev (@mortal.bard)')).toBeInTheDocument();
    expect(within(cardFor('The Hound of Culann')!).getByText('dev (@_coolpants)')).toBeInTheDocument();
    expect(within(cardFor('Pawluck Region Story Finale')!).getByText('dev (@kd29)')).toBeInTheDocument();
  });

  it('disambiguates the live strip and quest cards as one visible group', async () => {
    const card = {
      ...recruitment.items[0],
      dm: { handle: 'mira', displayName: 'Mira' },
    };
    const liveQuest = {
      ...recruitment.items[1],
      dm: { handle: 'mara', displayName: 'Mira' },
      displayStatus: 'live',
    };
    server.use(
      graphql.query('QuestList', ({ variables }) => {
        const items =
          variables.filters.displayStatus === 'live' ? [liveQuest] : [card];
        return HttpResponse.json({ data: { quests: { items, total: items.length } } });
      }),
    );
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('The Hound of Culann');

    const cardElement = screen.getByTestId('quest-card');
    const liveBand = document.querySelector('[data-el="quests.liveBand"]');
    expect(within(cardElement).getByText('Mira (@mira)')).toBeInTheDocument();
    expect(liveBand).toHaveTextContent('Mira (@mara)');
  });

  it('lists Open quests by earliest schedule with tavern chrome', async () => {
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByText('Siege of Kraghold')).toBeInTheDocument();
    expect(visibleQuestTitles()).toEqual(['Siege of Kraghold', 'Festival Run']);
    expect(
      within(screen.getAllByTestId('quest-card')[0]).getByText(
        /\d{1,2} \w{3} 2026, \d{2}:\d{2}/,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quests');
    expect(screen.getByText('2 quests')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Open quests' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Sign up/i }).length).toBeGreaterThan(
      0,
    );
    expect(
      document.querySelector('[data-page="quest-board"] [data-page-region="body"]'),
    ).toBeTruthy();
    expect(document.querySelector('.ctx-tavern')).toBeTruthy();
  });

  it('shows all six recruiting quests in order and opens a quest from the card', async () => {
    const user = userEvent.setup();
    server.use(
      graphql.query('QuestList', () =>
        HttpResponse.json({ data: { quests: recruitment } }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests" element={<QuestBoardPage />} />
        <Route path="/quests/Q-417" element={<p>Quest detail destination</p>} />
      </Routes>,
      { route: '/quests' },
    );
    await screen.findByText('The Hound of Culann');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(visibleQuestTitles()).toEqual([
      "Lily's Nightmares",
      'The Silence',
      'The Hound of Culann',
      'Pawluck Region Story Finale',
      'The Bell Tower of Dal',
      'The Silent Sawmills II',
    ]);
    const cards = screen.getAllByRole('article');
    cards.forEach((card) => {
      expect(within(card).queryByText(/^Q-\d+$/)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Open The Hound of Culann/i }));
    expect(await screen.findByText('Quest detail destination')).toBeInTheDocument();
  });

  it('filters projected statuses locally and keeps every status in All', async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    server.use(
      graphql.query('QuestList', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({ data: { quests: listGood } });
      }),
    );
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('Festival Run');
    expect(visibleQuestTitles()).toEqual(['Siege of Kraghold', 'Festival Run']);
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const statusBar = () => screen.getByRole('toolbar', { name: 'Quest status' });
    await user.click(within(statusBar()).getByRole('button', { name: 'Live' }));
    await screen.findByText('Live at the Gate');
    expect(visibleQuestTitles()).toEqual([
      'Live at the Gate',
      'Full party at the Gate',
    ]);
    await user.click(within(statusBar()).getByRole('button', { name: 'All' }));
    await screen.findByText('Settled expedition');
    expect(visibleQuestTitles()).toEqual(
      [...listGood.items]
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id))
        .map((item) => item.briefDocument.title),
    );
    expect(within(statusBar()).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(statusBar()).getByRole('button', { name: 'Open' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(requests).toContainEqual({ filters: {}, limit: 50, offset: 0 });
  });

  it('uses the saved viewer zone for both quick filters and card dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/Los_Angeles' }, null);
    const user = userEvent.setup();
    const items = listGood.items.slice(6).map((item, index) => ({
      ...item,
      scheduledAt: index === 0 ? '2025-12-31T23:00:00Z' : '2026-01-01T09:00:00Z',
    }));
    server.use(
      graphql.query('QuestList', ({ variables }) => HttpResponse.json({
        data: { quests: variables.filters.displayStatus === 'live'
          ? { items: [], total: 0 }
          : { items, total: items.length } },
      })),
    );
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('Siege of Kraghold');
    const dateBar = screen.getByRole('toolbar', { name: 'Quest date' });

    await user.click(within(dateBar).getByRole('button', { name: 'Today' }));
    expect(visibleQuestTitles()).toEqual(['Siege of Kraghold']);
    expect(within(screen.getByRole('article')).getByText('Wed 31 Dec 2025, 15:00')).toBeInTheDocument();

    await user.click(within(dateBar).getByRole('button', { name: 'Tomorrow' }));
    expect(visibleQuestTitles()).toEqual(['Festival Run']);
    expect(within(screen.getByRole('article')).getByText('Thu 1 Jan 2026, 01:00')).toBeInTheDocument();
  });

  it('loads another offset page when the current page has no Open matches', async () => {
    const user = userEvent.setup();
    const intersect = installIntersectionHarness();
    const requests: unknown[] = [];
    const items = Array.from({ length: 51 }, (_, index) => ({
      ...(index === 50 ? listGood.items[6] : listGood.items[3]),
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      shortCode: `Q-${index + 1000}`,
      briefDocument: {
        ...listGood.items[6].briefDocument,
        title: `Recruitment ${index + 1}`,
      },
    }));
    server.use(
      graphql.query('QuestList', ({ variables }) => {
        requests.push(variables);
        const population = items;
        return HttpResponse.json({
          data: {
            quests: {
              items: population.slice(
                variables.offset,
                variables.offset + variables.limit,
              ),
              total: population.length,
            },
          },
        });
      }),
    );
    const { queryClient } = renderWithProviders(<QuestBoardPage />);
    queryClient.setQueryData(queryKeys.questBoard, [
      { title: 'Unrelated board cache' },
    ]);
    expect(await screen.findByText('No open quests right now.')).toBeInTheDocument();
    expect(screen.queryByText('Recruitment 51')).not.toBeInTheDocument();
    intersect();
    await screen.findByText('Recruitment 51');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(within(screen.getByRole('toolbar', { name: 'Quest status' })).getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('article')).toHaveLength(51);
    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(2));
    expect(requests).toContainEqual({
      filters: {},
      limit: 50,
      offset: 50,
    });
    expect(
      queryClient.getQueryData(['quests', 'pages', {}]),
    ).toMatchObject({
      pages: [
        { items: expect.any(Array), total: 51 },
        { items: expect.any(Array), total: 51 },
      ],
    });
    expect(queryClient.getQueryData(queryKeys.questBoard)).toEqual([
      { title: 'Unrelated board cache' },
    ]);
  });

  it('shows loading while the board request is pending, then recruiting cards', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('QuestList', async () => {
        await pending;
        return HttpResponse.json({ data: { quests: recruitment } });
      }),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(document.querySelectorAll('[data-el="quest-board-skeleton"]')).toHaveLength(
      6,
    );
    expect(
      screen.getByRole('region', { name: 'Quest filters' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    release();
    expect(await screen.findByText('The Hound of Culann')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('shows a controlled empty lane and retains segment controls', async () => {
    const user = userEvent.setup();
    server.use(
      graphql.query('QuestList', () =>
        HttpResponse.json({ data: { quests: { items: [], total: 0 } } }),
      ),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByText('No open quests right now.')).toBeInTheDocument();
    const statusBar = screen.getByRole('toolbar', { name: 'Quest status' });
    await user.click(within(statusBar).getByRole('button', { name: 'All' }));
    expect(within(statusBar).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('recovers visible quests from an empty All plus This week result', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('Siege of Kraghold');

    const statusBar = screen.getByRole('toolbar', { name: 'Quest status' });
    await user.click(within(statusBar).getByRole('button', { name: 'All' }));
    const dateBar = screen.getByRole('toolbar', { name: 'Quest date' });
    await user.click(within(dateBar).getByRole('button', { name: 'This week' }));

    expect(await screen.findByText('No quests match these filters.')).toBeInTheDocument();
    expect(screen.queryByText('There are no quests on the board yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all quests' }));
    expect(within(dateBar).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(listGood.items.length);
  });

  it('clears status, date, and search together when showing all quests', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('Siege of Kraghold');
    const statusBar = screen.getByRole('toolbar', { name: 'Quest status' });
    const dateBar = screen.getByRole('toolbar', { name: 'Quest date' });
    await user.click(within(dateBar).getByRole('button', { name: 'This week' }));
    await user.click(screen.getByRole('button', { name: 'Search quests' }));
    const search = screen.getByRole('searchbox', { name: 'Search quests' });
    await user.type(search, 'no matching quest');

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Show all quests' }));

    expect(within(statusBar).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dateBar).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(search).toHaveValue('');
    expect(screen.getAllByRole('article')).toHaveLength(listGood.items.length);
  });

  it('rejects an empty first page with a positive population instead of claiming an empty lane', async () => {
    server.use(
      graphql.query('QuestList', () =>
        HttpResponse.json({ data: { quests: { items: [], total: 3 } } }),
      ),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server returned data this screen cannot use.',
    );
    expect(screen.queryByText('No open quests right now.')).not.toBeInTheDocument();
  });

  it('retries the selected generic population after a controlled error', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const requests: unknown[] = [];
    server.use(
      graphql.query('QuestList', ({ variables }) => {
        requests.push(variables);
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({
              errors: [
                { message: 'private failure detail', extensions: { code: 'INTERNAL' } },
              ],
            })
          : HttpResponse.json({ data: { quests: recruitment } });
      }),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.queryByText('private failure detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('The Hound of Culann');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toContainEqual({ filters: {}, limit: 50, offset: 0 });
  });

  it('renders a live strip when live quests exist', async () => {
    const liveItem = {
      ...listGood.items[5],
      status: 'open',
      displayStatus: 'live',
      briefDocument: { ...listGood.items[5].briefDocument, title: 'Gate Watch' },
      dm: { handle: 'fen', displayName: 'Fen' },
    };
    server.use(
      graphql.query('QuestList', ({ variables }) => {
        const filters = (variables.filters ?? {}) as {
          status?: string;
          displayStatus?: string;
        };
        if (filters.displayStatus === 'live') {
          return HttpResponse.json({
            data: { quests: { items: [liveItem], total: 1 } },
          });
        }
        return HttpResponse.json({
          data: { quests: { items: [listGood.items[6]], total: 1 } },
        });
      }),
    );
    renderWithProviders(<QuestBoardPage />);
    await screen.findByText('Siege of Kraghold');
    expect(await screen.findByText(/sessions live now/)).toBeInTheDocument();
    expect(document.querySelector('[data-el="quests.liveBand"]')).toBeTruthy();
    expect(screen.getByText(/Gate Watch/)).toBeInTheDocument();
    expect(screen.getByText(/1 DMs accepting/)).toBeInTheDocument();
  });

  describe('Filter popover', () => {
    const DM_ID = '22222222-2222-4222-8222-222222222222';
    function useDirectoryAndRecord() {
      const requests: Array<{ filters: Record<string, unknown> }> = [];
      server.use(
        graphql.query('QuestBoardChrome', () =>
          HttpResponse.json({
            data: {
              communityDirectory: {
                total: 2,
                entries: [
                  { memberId: DM_ID, handle: 'mira', displayName: 'Mira', acceptingPlayers: true, isDm: true },
                  { memberId: '33333333-3333-4333-8333-333333333333', handle: 'fen', displayName: 'Fen', acceptingPlayers: false, isDm: true },
                ],
              },
            },
          }),
        ),
        graphql.query('QuestList', ({ variables }) => {
          requests.push({ filters: variables.filters as Record<string, unknown> });
          return HttpResponse.json({ data: { quests: recruitment } });
        }),
      );
      return requests;
    }

    it('applies a DM and a specific date to the API read and shows a count badge', async () => {
      const user = userEvent.setup();
      const requests = useDirectoryAndRecord();
      renderWithProviders(<QuestBoardPage />);
      await screen.findByText('The Hound of Culann');
      const trigger = screen.getByRole('button', { name: 'Filter' });
      await user.click(trigger);
      const panel = await screen.findByRole('dialog', { name: 'Filter quests' });
      expect(within(panel).getByRole('heading', { name: 'Filter quests' })).toBeInTheDocument();
      const dm = within(panel).getByLabelText('DM');
      await waitFor(() =>
        expect(within(dm).getAllByRole('option').map((o) => o.textContent)).toEqual([
          'Any DM',
          'Fen',
          'Mira',
        ]),
      );
      await user.selectOptions(dm, DM_ID);
      fireEvent.change(within(panel).getByLabelText('Date'), {
        target: { value: '2026-10-25' },
      });
      await user.click(within(panel).getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => {
        const last = requests.at(-1)!.filters;
        expect(last.dmId).toBe(DM_ID);
        expect(typeof last.scheduledFrom).toBe('string');
        expect(typeof last.scheduledTo).toBe('string');
        expect(Date.parse(last.scheduledTo as string)).toBeGreaterThan(
          Date.parse(last.scheduledFrom as string),
        );
      });
      expect(screen.getByRole('button', { name: /Filter\s*2 active/ })).toBeInTheDocument();
    });

    it('overrides the quick date segment while a specific date is set', async () => {
      const user = userEvent.setup();
      useDirectoryAndRecord();
      renderWithProviders(<QuestBoardPage />);
      await screen.findByText('The Hound of Culann');
      await user.click(screen.getByRole('button', { name: 'Today' }));
      expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: 'Filter' }));
      const panel = await screen.findByRole('dialog', { name: 'Filter quests' });
      fireEvent.change(within(panel).getByLabelText('Date'), { target: { value: '2026-10-25' } });
      await user.click(within(panel).getByRole('button', { name: 'Apply' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument(),
      );
      expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('clears filters, and closes on Escape', async () => {
      const user = userEvent.setup();
      const requests = useDirectoryAndRecord();
      renderWithProviders(<QuestBoardPage />);
      await screen.findByText('The Hound of Culann');
      await user.click(screen.getByRole('button', { name: 'Filter' }));
      let panel = await screen.findByRole('dialog', { name: 'Filter quests' });
      fireEvent.change(within(panel).getByLabelText('Date'), { target: { value: '2026-10-25' } });
      await user.click(within(panel).getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(requests.at(-1)!.filters.scheduledFrom).toBeDefined());
      await user.click(screen.getByRole('button', { name: /Filter\s*1 active/ }));
      panel = await screen.findByRole('dialog', { name: 'Filter quests' });
      expect(within(panel).getByLabelText('Date')).toHaveValue('2026-10-25');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Filter/ }));
      panel = await screen.findByRole('dialog', { name: 'Filter quests' });
      await user.click(within(panel).getByRole('button', { name: 'Clear' }));
      await waitFor(() => expect(requests.at(-1)!.filters).toEqual({}));
      expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    });
  });

  it('shows controlled error even when GraphQL also returns data', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [
            { message: 'private failure detail', extensions: { code: 'INTERNAL' } },
          ],
          data: { quests: listGood },
        }),
      ),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
