import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CharacterPage } from '../../../src/features/character/pages/CharacterPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('CharacterPage', () => {
  it('renders character name and backstory', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(
      await screen.findByRole('heading', { name: 'Lyra Storm' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Child of the Weeping')).toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
