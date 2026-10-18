import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AdminTodayBody } from '../../../src/features/admin/pages/AdminPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';

beforeEach(() => signIn());

describe('AdminTodayBody', () => {
  it('shows operations and directory', async () => {
    renderWithProviders(<AdminTodayBody />);
    expect(await screen.findByText(/Active alerts: 1/)).toBeInTheDocument();
    expect(await screen.findByText(/Lyra Storm/)).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    const boom = () =>
      HttpResponse.json({
        errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
      });
    mockGraphqlOps({
      AdminOperations: boom,
      AdminCharacters: boom,
    });
    renderWithProviders(<AdminTodayBody />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]).toHaveTextContent('Something went wrong. Please try again.');
  });
});
