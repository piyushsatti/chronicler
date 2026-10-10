import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { DocumentPage } from '../../../src/features/document/pages/DocumentPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('DocumentPage', () => {
  it('renders document title and body', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/documents/:slug" element={<DocumentPage />} />
      </Routes>,
      { route: '/documents/tree-of-light' },
    );
    expect(
      await screen.findByRole('heading', { name: 'Tree of Light' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tree stands at the heart/),
    ).toBeInTheDocument();
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
        <Route path="/documents/:slug" element={<DocumentPage />} />
      </Routes>,
      { route: '/documents/tree-of-light' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
