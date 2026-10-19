import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { ChroniclesListPage } from '../../../src/features/chronicle/pages/ChroniclesListPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('ChroniclesListPage', () => {
  it('renders timeline chips and season groups from the chronicle list', async () => {
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('SESSION')).toBeInTheDocument();
    expect(screen.getByText('DM RECAP')).toBeInTheDocument();
    expect(screen.getByText('AE 412 · FROSTMELT')).toBeInTheDocument();
    expect(screen.getByText('Vault Delve — Session recap')).toBeInTheDocument();
    expect(screen.getByLabelText('Search entries')).toBeInTheDocument();
    expect(screen.getByText('ARC')).toBeInTheDocument();
    expect(screen.getByText('REGION')).toBeInTheDocument();
  });

  it('filters the timeline by search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Vault Delve — Session recap');
    await user.type(screen.getByLabelText('Search entries'), 'table notes');
    expect(screen.queryByText('Vault Delve — Session recap')).not.toBeInTheDocument();
    expect(screen.getByText("Ash's table notes")).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });
});
