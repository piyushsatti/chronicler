import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { useTheme } from '../../src/context/ThemeContext.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../src/context/theme.utils.js';
import { useHomePage } from '../../src/features/home/hooks/useHomePage.js';
import { useQuestBoardPage } from '../../src/features/quest/hooks/useQuestBoardPage.js';
import { server } from '../../src/mocks/server.js';
import { renderWithProviders } from '../test-utils.js';
import home from '../fixtures/wire/home/lanes-good.json';
import board from '../fixtures/wire/quest/board-good.json';
function CachedCards() {
  const home = useHomePage();
  const board = useQuestBoardPage();
  const { setPreferences } = useTheme();
  return (
    <>
      {home.status === 'ready' ? (
        <p data-testid="home-card-time">{home.view.cards[0]?.when}</p>
      ) : null}
      {board.status === 'ready' ? (
        <p data-testid="board-card-time">{board.view[0]?.card.when}</p>
      ) : null}
      <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
        Change zone
      </button>
    </>
  );
}
describe('cached card timezone presentation', () => {
  it('updates already loaded Home and Quest cards when saved preferences change without new data requests', async () => {
    let homeReads = 0;
    let boardReads = 0;
    const scheduledAt = '2026-03-08T04:30:00Z';
    server.use(
      graphql.query('HomeWarRoom', () => {
        homeReads++;
        return HttpResponse.json({
          data: {
            ...home,
            questBoard: {
              ...home.questBoard,
              items: home.questBoard.items.map((item) => ({ ...item, scheduledAt })),
            },
          },
        });
      }),
      graphql.query('QuestList', () => {
        boardReads++;
        return HttpResponse.json({
          data: {
            quests: {
              items: board.items.map((item) => ({ ...item, scheduledAt })),
              total: board.total,
            },
          },
        });
      }),
    );
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(<CachedCards />);
    expect(await screen.findByTestId('home-card-time')).toHaveTextContent(
      'Sat, 07 Mar 2026, 23:30',
    );
    expect(await screen.findByTestId('board-card-time')).toHaveTextContent(
      'Sat, 07 Mar 2026, 23:30',
    );
    const reads = { homeReads, boardReads };
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change zone' }));
    expect(screen.getByTestId('home-card-time')).toHaveTextContent(
      'Sun, 08 Mar 2026, 10:00',
    );
    expect(screen.getByTestId('board-card-time')).toHaveTextContent(
      'Sun, 08 Mar 2026, 10:00',
    );
    expect({ homeReads, boardReads }).toEqual(reads);
  });
});
