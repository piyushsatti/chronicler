import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AdminTodayBody } from '../../../src/features/admin/pages/AdminPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';

beforeEach(() => signIn());

describe('AdminTodayBody', () => {
  it('shows wired summary counts, alert labels, and directory', async () => {
    renderWithProviders(<AdminTodayBody />);

    expect(await screen.findByText(/Lyra Storm/)).toBeInTheDocument();

    const summary = document.querySelector('[data-el="admin.today.summary"]');
    expect(summary).not.toBeNull();
    const summaryScope = within(summary as HTMLElement);
    expect(summaryScope.getByText(String(goodOps.activeAlertCount))).toBeInTheDocument();
    expect(summaryScope.getByText(String(goodOps.pendingDeliveryCount))).toBeInTheDocument();
    expect(summaryScope.getByText(String(goodOps.deliveryTotal))).toBeInTheDocument();
    expect(summaryScope.getByText('Active alerts')).toBeInTheDocument();

    const alertsLink = document.querySelector('[data-el="admin.today.alerts"]');
    expect(alertsLink).not.toBeNull();
    expect(alertsLink).toHaveAttribute('href', '/admin/data-health');

    expect(
      screen.getAllByText(goodOps.activeAlerts[0].label).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Active alerts: 1/)).toBeInTheDocument();
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
