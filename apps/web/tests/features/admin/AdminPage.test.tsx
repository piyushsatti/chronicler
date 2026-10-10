import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminPage } from '../../../src/features/admin/pages/AdminPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('AdminPage', () => {
  it('shows operations and directory', async () => {
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText(/Active alerts: 1/)).toBeInTheDocument();
    expect(await screen.findByText(/Lyra Storm/)).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
