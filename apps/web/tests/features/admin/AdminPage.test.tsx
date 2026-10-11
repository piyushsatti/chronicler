import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminTodayBody } from '../../../src/features/admin/pages/AdminPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

beforeEach(() => signIn());

describe('AdminTodayBody', () => {
  it('shows operations and directory', async () => {
    renderWithProviders(<AdminTodayBody />);
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
    renderWithProviders(<AdminTodayBody />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]).toHaveTextContent('Something went wrong. Please try again.');
  });
});
