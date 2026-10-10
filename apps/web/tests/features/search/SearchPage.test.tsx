import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { SearchPage } from '../../../src/features/search/pages/SearchPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('SearchPage', () => {
  it('lists hits after typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />);
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'tree');
    expect(
      await screen.findByRole('link', { name: 'Tree of Light' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ashwin')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body.query?.includes('query Search')) {
          return HttpResponse.json({
            errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
          });
        }
        return HttpResponse.json({
          errors: [
            { message: 'Unhandled', extensions: { code: 'UNHANDLED' } },
          ],
        });
      }),
    );
    renderWithProviders(<SearchPage />);
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'tree');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});

