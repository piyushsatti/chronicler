import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { DMProfilePage } from '../../../src/features/profile/pages/ProfilePages.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('DMProfilePage', () => {
  it('renders dm handle and accepting status', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'mira' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('@mira')).toBeInTheDocument();
    expect(screen.getByText('Horror & heists')).toBeInTheDocument();
    expect(screen.getByText('Accepting players')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to directory' }),
    ).toHaveAttribute('href', '/dms');
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
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('does not import adapters from the page module', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/features/profile/pages/ProfilePages.tsx'),
      'utf8',
    );
    expect(text).not.toMatch(/adapters\//);
  });
});
