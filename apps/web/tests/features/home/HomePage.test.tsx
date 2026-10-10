import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { HomePage } from '../../../src/features/home/pages/HomePage.js';
import { server } from '../../../src/mocks/server.js';
import lanesBad from '../../fixtures/wire/home/lanes-bad-board.json';
import { renderWithProviders } from '../../test-utils.js';

describe('HomePage', () => {
  it('renders war-room welcome and lane cards', async () => {
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to Chronicler.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('01 — Now recruiting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Siege of Kraghold' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Festival Run' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vault Delve' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mira' })).toHaveAttribute(
      'href',
      '/dms/@mira',
    );
  });

  it('shows controlled error when lanes wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            questBoard: lanesBad.questBoard,
            quests: lanesBad.quests,
            recentlyClosedQuests: lanesBad.recentlyClosedQuests,
            communityDirectory: lanesBad.communityDirectory,
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The server returned data this screen cannot use.',
      );
    });
  });

  it('shows empty when all lanes are empty', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            questBoard: { items: [], total: 0 },
            quests: { items: [], total: 0 },
            recentlyClosedQuests: { items: [], total: 0 },
            communityDirectory: { entries: [], total: 0 },
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByText('The war room is quiet for now.')).toBeInTheDocument();
  });
});
