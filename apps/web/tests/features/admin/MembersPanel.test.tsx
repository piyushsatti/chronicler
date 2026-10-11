import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

beforeEach(() => signIn());

describe('MembersPanel', () => {
  it('lists members from the admin directory', async () => {
    renderWithProviders(<AdminPeoplePage />);
    expect(
      await screen.findByRole('region', { name: 'Members & roles' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('Ashwin')).toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<AdminPeoplePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
