import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { VerifyPage } from '../../../src/features/admin/pages/VerifyPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

beforeEach(() => signIn());

describe('VerifyPage', () => {
  it('lists pending queues', async () => {
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByText('Pending Hero')).toBeInTheDocument();
    // DM tab is not the default; switch via tab button.
    await screen.findByRole('tab', { name: 'DM Profiles' });
    // Character tab is default and shows the pending character.
    expect(screen.getByText('Pending Hero')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
