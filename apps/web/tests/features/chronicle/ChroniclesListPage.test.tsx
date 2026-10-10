import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { ChroniclesListPage } from '../../../src/features/chronicle/pages/ChroniclesListPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('ChroniclesListPage', () => {
  it('lists chronicles', async () => {
    renderWithProviders(<ChroniclesListPage />);
    expect(
      await screen.findByRole('link', { name: 'Vault Delve — Session recap' }),
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
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
