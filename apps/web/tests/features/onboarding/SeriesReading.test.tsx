import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SeriesPage } from '../../../src/features/onboarding/pages/SeriesPage.js';
import { QuestBoardPage } from '../../../src/features/quest/pages/QuestBoardPage.js';
import { server } from '../../../src/mocks/server.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/onboarding/retained-good.json';

function renderSeries() {
  return renderWithProviders(
    <Routes>
      <Route path="/series/:shortCode" element={<SeriesPage />} />
    </Routes>,
    { route: `/series/${good.arc.id}` },
  );
}

describe('series reading page', () => {
  it('shows quest cards with real seats, DM names, lifecycle colours and the next session', async () => {
    const quests = ['open', 'full', 'cancelled', 'played', 'closed'].map(
      (status, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        shortCode: `quest-${index}`,
        status,
        displayStatus: status,
        scheduledAt:
          index === 2
            ? '2099-01-01T18:00:00Z'
            : index > 2
              ? '2030-10-14T18:00:00Z'
              : '2098-10-14T18:00:00Z',
        slotsMax: index === 1 ? 1 : 4,
        dm: { handle: 'rowan', displayName: 'Rowan Vale' },
        briefDocument: {
          title: `Quest ${index}`,
          effectiveBody: 'A journey along the coast.',
        },
        participants:
          index === 1
            ? [
                {
                  characterId: good.document.id,
                  characterName: 'Aster',
                  memberAvatarUrl: null,
                  status: 'signed_up',
                },
              ]
            : [],
      }),
    );
    server.use(
      graphql.query('RetainedSeriesArc', () =>
        HttpResponse.json({
          data: { questArc: { ...good.arc, questCount: quests.length, quests } },
        }),
      ),
    );
    renderSeries();
    const cards = await screen.findAllByTestId('quest-card');
    expect(cards).toHaveLength(5);
    expect(screen.getByText('5 quests')).toBeVisible();
    expect(screen.getByText('With Rowan Vale')).toBeVisible();
    expect(screen.getByText(/Next session/)).toHaveTextContent('2098');
    expect(
      within(cards[0]).getByRole('link', { name: 'Open Quest 0' }),
    ).toHaveAttribute('href', '/quests/quest-0');
    expect(within(cards[0]).getByText('4 seats open')).toBeVisible();
    expect(within(cards[1]).getByText('1 of 1 filled')).toBeVisible();
    expect(within(cards[1]).getByText('Aster')).toBeVisible();
    expect(within(cards[1]).getByText('Full', { selector: '.state' })).toHaveAttribute(
      'data-s',
      'FULL',
    );
    expect(
      within(cards[2]).getByText('Cancelled', { selector: '.state' }),
    ).toHaveAttribute('data-s', 'CANCELLED');
    expect(
      within(cards[3]).getByText('Closed', { selector: '.state' }),
    ).toHaveAttribute('data-s', 'CLOSED');
    expect(
      within(cards[4]).getByText('Closed', { selector: '.state' }),
    ).toHaveAttribute('data-s', 'CLOSED');
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Created /)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New series' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the normal header and a sign-in action for a denied series', async () => {
    server.use(
      graphql.query('RetainedSeriesArc', () =>
        HttpResponse.json({
          errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    renderSeries();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to see this');
    expect(
      screen.getByRole('heading', { name: 'Quest series', level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Quests' })).toHaveAttribute(
      'href',
      '/quests',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('offers the creation control from the quest board rather than the series detail', async () => {
    localStorage.setItem(
      TOKEN_KEY,
      `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'fixture-only', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
    );
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: {
            memberMe: {
              id: good.arc.createdBy,
              handle: 'fixture-dm',
              displayName: 'Fixture DM',
              roles: ['dm'],
            },
          },
        }),
      ),
    );
    renderWithProviders(<QuestBoardPage />, { route: '/quests' });
    expect(
      await screen.findByRole('heading', { name: 'Quests', level: 1 }),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'New series' }));
    expect(
      await screen.findByRole('textbox', { name: 'New series name' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create series' })).toBeVisible();
  });
});
