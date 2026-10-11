import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { QuestBoardPage } from '../../../src/features/quest/pages/QuestBoardPage.js';
import { server } from '../../../src/mocks/server.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import listGood from '../../fixtures/wire/quest/list-good.json';
import recruitment from '../../fixtures/wire/quest/board-recruitment.json';
import { renderWithProviders } from '../../test-utils.js';

function visibleQuestLinks() {
  return screen
    .getAllByRole('article')
    .map((card) => within(within(card).getByRole('heading', { level: 2 })).getByRole('link').getAttribute('href'));
}

describe('QuestBoardPage', () => {
  it('lists the generic Open population in server order', async () => {
    renderWithProviders(<QuestBoardPage />);
    expect(
      await screen.findByRole('link', { name: 'Siege of Kraghold' }),
    ).toBeInTheDocument();
    expect(visibleQuestLinks()).toEqual(['/quests/Q-303', '/quests/Q-101']);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Tavern Board');
    expect(screen.getByText('Find a table')).toBeInTheDocument();
    expect(screen.getByText('Open: 2 quests')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Open quests' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'My friends' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Discord:/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-page="quest-board"] [data-page-region="body"]')).toBeTruthy();
  });

  it('shows all six recruiting quests in order and follows a quest link', async () => {
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
    await screen.findByRole('link', { name: 'The Silence' });
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(visibleQuestLinks()).toEqual([
      '/quests/Q-417',
      '/quests/Q-419',
      '/quests/Q-420',
      '/quests/Q-421',
      '/quests/Q-422',
      '/quests/Q-425',
    ]);
    const cards = screen.getAllByRole('article');
    const expectedCodes = ['Q-417', 'Q-419', 'Q-420', 'Q-421', 'Q-422', 'Q-425'];
    const expectedLabels = ['filling', 'filling', 'filling', 'filling', 'open', 'filling'];
    cards.forEach((card, index) => {
      expect(within(card).getByText(expectedCodes[index])).toBeInTheDocument();
      expect(within(card).getByText(expectedLabels[index])).toBeInTheDocument();
    });
    await user.click(screen.getByRole('link', { name: 'The Hound of Culann' }));
    expect(await screen.findByText('Quest detail destination')).toBeInTheDocument();
  });

  it('requests each server segment and keeps full-live rows and all machine statuses', async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    const populations = {
      open: [listGood.items[4], listGood.items[6]],
      scheduled: [listGood.items[7]],
      live: [listGood.items[4], listGood.items[5]],
      all: listGood.items,
    };
    server.use(graphql.query('QuestList', ({ variables }) => {
      requests.push(variables);
      const key = variables.filters.displayStatus ?? variables.filters.status ?? 'all';
      const items = populations[key as keyof typeof populations];
      return HttpResponse.json({ data: { quests: { items, total: items.length } } });
    }));
    renderWithProviders(<QuestBoardPage />);
    await screen.findByRole('link', { name: 'Siege of Kraghold' });
    expect(visibleQuestLinks()).toEqual(['/quests/Q-303', '/quests/Q-101']);
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveClass('on');
    expect(screen.getByRole('tab', { name: 'All' })).not.toHaveClass('on');

    await user.click(screen.getByRole('tab', { name: 'Scheduled' }));
    await screen.findByRole('link', { name: 'Festival Run' });
    expect(visibleQuestLinks()).toEqual(['/quests/Q-202']);
    await user.click(screen.getByRole('tab', { name: 'Live' }));
    await screen.findByRole('link', { name: 'Full party at the Gate' });
    expect(visibleQuestLinks()).toEqual(['/quests/Q-303', '/quests/Q-304']);
    await user.click(screen.getByRole('tab', { name: 'All' }));
    await screen.findByRole('link', { name: 'Settled expedition' });
    expect(visibleQuestLinks()).toEqual(listGood.items.map((item) => `/quests/${item.shortCode}`));
    expect(screen.getByRole('tab', { name: 'All' })).toHaveClass('on');
    expect(screen.getByRole('tab', { name: 'Open' })).not.toHaveClass('on');
    expect(requests).toEqual([
      { filters: { status: 'open' }, limit: 50, offset: 0 },
      { filters: { displayStatus: 'scheduled' }, limit: 50, offset: 0 },
      { filters: { displayStatus: 'live' }, limit: 50, offset: 0 },
      { filters: {}, limit: 50, offset: 0 },
    ]);
  });

  it('loads beyond 50 with total-aware increments and resets the limit on segment change', async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    const items = Array.from({ length: 51 }, (_, index) => ({
      ...listGood.items[6],
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      shortCode: `Q-${index + 1000}`,
      briefDocument: { ...listGood.items[6].briefDocument, title: `Recruitment ${index + 1}` },
    }));
    server.use(graphql.query('QuestList', ({ variables }) => {
      requests.push(variables);
      const population = variables.filters.displayStatus === 'live' ? [listGood.items[5]] : items;
      return HttpResponse.json({ data: { quests: {
        items: population.slice(variables.offset, variables.offset + variables.limit),
        total: population.length,
      } } });
    }));
    const { queryClient } = renderWithProviders(<QuestBoardPage />);
    queryClient.setQueryData(queryKeys.questBoard, [{ title: 'Unrelated board cache' }]);
    await screen.findByRole('link', { name: 'Recruitment 50' });
    expect(screen.getAllByRole('article')).toHaveLength(50);
    expect(screen.queryByRole('link', { name: 'Recruitment 51' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('link', { name: 'Recruitment 51' });
    expect(screen.getAllByRole('article')).toHaveLength(51);
    expect(visibleQuestLinks()).toEqual(items.map((item) => `/quests/${item.shortCode}`));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Live' }));
    await screen.findByRole('link', { name: 'Full party at the Gate' });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: 'Open' }));
    await screen.findByRole('link', { name: 'Recruitment 50' });
    expect(screen.queryByRole('link', { name: 'Recruitment 51' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests).toEqual([
      { filters: { status: 'open' }, limit: 50, offset: 0 },
      { filters: { status: 'open' }, limit: 100, offset: 0 },
      { filters: { displayStatus: 'live' }, limit: 50, offset: 0 },
      { filters: { status: 'open' }, limit: 50, offset: 0 },
    ]);
    expect(queryClient.getQueryData(queryKeys.questList({ status: 'open' }, 50, 0))).toMatchObject({ items: expect.any(Array), total: 51 });
    expect(queryClient.getQueryData(queryKeys.questList({ status: 'open' }, 100, 0))).toMatchObject({ items: expect.any(Array), total: 51 });
    expect(queryClient.getQueryData(queryKeys.questBoard)).toEqual([{ title: 'Unrelated board cache' }]);
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
    expect(document.querySelectorAll('[data-el="quest-board-skeleton"]')).toHaveLength(6);
    expect(screen.getByRole('tablist', { name: 'Quest board filters' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    release();
    expect(
      await screen.findByRole('link', { name: 'The Hound of Culann' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a controlled empty lane and retains segment controls', async () => {
    const user = userEvent.setup();
    server.use(
      graphql.query('QuestList', () =>
        HttpResponse.json({ data: { quests: { items: [], total: 0 } } }),
      ),
    );
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByText('No quests in this lane.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'All' }));
    expect(await screen.findByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('rejects an empty first page with a positive population instead of claiming an empty lane', async () => {
    server.use(graphql.query('QuestList', () => HttpResponse.json({ data: { quests: { items: [], total: 3 } } })));
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The server returned data this screen cannot use.');
    expect(screen.queryByText('No quests in this lane.')).not.toBeInTheDocument();
  });

  it('retries the selected generic population after a controlled error', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const requests: unknown[] = [];
    server.use(graphql.query('QuestList', ({ variables }) => {
      requests.push(variables);
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ errors: [{ message: 'private failure detail', extensions: { code: 'INTERNAL' } }] })
        : HttpResponse.json({ data: { quests: recruitment } });
    }));
    renderWithProviders(<QuestBoardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText('private failure detail')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'The Hound of Culann' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toEqual([
      { filters: { status: 'open' }, limit: 50, offset: 0 },
      { filters: { status: 'open' }, limit: 50, offset: 0 },
    ]);
  });

  it('follows the existing summary route from the board card', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/quests" element={<QuestBoardPage />} />
        <Route path="/quests/Q-101/summary" element={<p>Quest summary destination</p>} />
      </Routes>,
      { route: '/quests' },
    );
    await screen.findByRole('link', { name: 'Siege of Kraghold' });
    const card = screen.getByRole('article', { name: 'Siege of Kraghold' });
    await user.click(within(card).getByRole('link', { name: 'Session summaries' }));
    expect(await screen.findByText('Quest summary destination')).toBeInTheDocument();
  });

  it('shows controlled error even when GraphQL also returns data', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'private failure detail', extensions: { code: 'INTERNAL' } }],
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
