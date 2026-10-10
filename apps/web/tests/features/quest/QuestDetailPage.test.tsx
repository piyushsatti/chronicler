import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { QuestDetailPage } from '../../../src/features/quest/pages/QuestDetailPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('QuestDetailPage', () => {
  it('renders summary and roster region roles', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByText('Q-101')).toBeInTheDocument();
    expect(screen.getByText(/Discord delivery: applied/)).toBeInTheDocument();
    expect(document.querySelector('[data-page-region="summary"]')).toBeTruthy();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
