import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AdminTodayBody } from '../../../src/features/admin/pages/AdminPage.js';
import userEvent from '@testing-library/user-event';
import {
  AdminCharactersPage,
  AdminDeliveryPage,
} from '../../../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import type { AdminOperationsQuery } from '../../../src/api/graphql.operations.gen.js';

const unobservedOps = {
  ...goodOps,
  pendingDeliveryCount: 0,
  terminalDeliveryCount: 1,
  deliveryTotal: 1,
  config: {
    publicOrigin: '',
    publicOriginHealthy: null,
    deliveryMode: 'disabled',
    announcementRoleId: null,
    announcementRoleSource: 'site_settings',
    announcementRoleHealthy: null,
  },
  deliveries: [
    {
      id: '54516d41-ecfc-429f-bbd9-0c1bca2398be',
      questId: null,
      questShortCode: null,
      questTitle: null,
      questLink: null,
      eventLink: null,
      messageId: null,
      state: 'dead',
      desiredRevision: null,
      appliedRevision: null,
      failureStreak: 8,
      maxAttempts: 8,
      nextAttemptAt: '2026-10-20T07:06:00Z',
      safeError: null,
      redriveCount: 0,
      createdAt: '2026-10-20T07:06:00Z',
      updatedAt: '2026-10-20T07:06:00Z',
    },
  ],
} satisfies AdminOperationsQuery['adminOperations'];

beforeEach(() => signIn());

describe('Admin today and delivery', () => {
  it('summarises counts and previews alerts without embedding the full lists', async () => {
    renderWithProviders(<AdminTodayBody />);

    const summary = await screen.findByRole('heading', { name: 'At a glance' });
    const summaryScope = within(summary.closest('section') as HTMLElement);
    expect(
      summaryScope.getByRole('link', { name: /Active alerts\s*1/ }),
    ).toHaveAttribute('href', '/admin/data-health');
    expect(
      summaryScope.getByRole('link', { name: /Pending deliveries\s*2\s*of 5 deliveries/ }),
    ).toHaveAttribute('href', '/admin/delivery');
    expect(summaryScope.getByRole('link', { name: /Awaiting review/ })).toHaveAttribute(
      'href',
      '/admin/review',
    );
    expect(summaryScope.getByRole('link', { name: /Characters/ })).toHaveAttribute(
      'href',
      '/admin/characters',
    );

    const alerts = screen.getByRole('list', { name: 'Active alerts' });
    expect(within(alerts).getByText(goodOps.activeAlerts[0].label)).toBeVisible();
    expect(screen.getByRole('link', { name: 'View all alerts' })).toHaveAttribute(
      'href',
      '/admin/data-health',
    );
    // The overview links to the delivery and character tabs instead of repeating them.
    expect(screen.queryByText(/Delivery configuration/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lyra Storm/)).not.toBeInTheDocument();
    expect(screen.getByText('No deliveries recorded yet.')).toBeVisible();
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

  it('renders unobserved diagnostics and retains an unmatched job without a guessed destination', async () => {
    mockGraphqlOps({
      AdminOperations: () =>
        HttpResponse.json({ data: { adminOperations: unobservedOps } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    expect(await screen.findByText('Quest delivery', { exact: true })).toBeVisible();
    const panel = within(
      document.querySelector('[data-el="admin.deliveryPanel"]') as HTMLElement,
    );
    expect(
      panel.getByText(/Public origin: not configured \(not observed\)/),
    ).toBeVisible();
    expect(
      panel.getByText(
        /Announcement role: not configured · Site settings · not observed/,
      ),
    ).toBeVisible();
    // State reads as a label; unknown revisions are left out rather than spelled out.
    expect(panel.getByText('Gave up', { exact: true })).toBeVisible();
    expect(panel.queryByText(/revision unknown/i)).not.toBeInTheDocument();
    expect(panel.queryByText(/\d{4}-\d{2}-\d{2}T/)).not.toBeInTheDocument();
    expect(panel.getByText('Delivery total: 1', { exact: true })).toBeVisible();
    expect(panel.queryByRole('link', { name: 'Open quest' })).not.toBeInTheDocument();
    expect(panel.queryByText(/healthy|needs attention/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [true, 'healthy'],
    [false, 'needs attention'],
  ] as const)('shows actual observed health (%s)', async (observed, label) => {
    mockGraphqlOps({
      AdminOperations: () =>
        HttpResponse.json({
          data: {
            adminOperations: {
              ...unobservedOps,
              config: {
                ...unobservedOps.config,
                publicOrigin: 'https://campaign.example',
                publicOriginHealthy: observed,
                announcementRoleHealthy: observed,
              },
            },
          },
        }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    expect(await screen.findByText('Quest delivery', { exact: true })).toBeVisible();
    const panel = within(
      document.querySelector('[data-el="admin.deliveryPanel"]') as HTMLElement,
    );
    expect(
      panel.getByText(
        `Mode: Disabled · Public origin: https://campaign.example (${label})`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      panel.getByText(`Announcement role: not configured · Site settings · ${label}`, {
        exact: true,
      }),
    ).toBeVisible();
  });
});

describe('Admin character directory', () => {
  it('filters by a region chosen by name and sends its id', async () => {
    const regionId = '11111111-1111-4111-8111-111111111111';
    const seen: unknown[] = [];
    mockGraphqlOps({
      AdminRegions: () =>
        HttpResponse.json({
          data: {
            regions: [
              {
                id: regionId,
                name: 'Salt Coast',
                kind: 'server',
                charterDeadline: null,
                documentId: null,
              },
            ],
          },
        }),
      AdminCharacters: (body) => {
        seen.push(body.variables);
        return HttpResponse.json({
          data: { adminCharacterDirectory: { items: [], total: 0 } },
        });
      },
    });
    renderWithProviders(<AdminCharactersPage />, { route: '/admin/characters' });
    const region = await screen.findByRole('combobox', { name: 'Region' });
    await screen.findByRole('option', { name: 'Salt Coast' });
    expect(screen.queryByText(/UUID/)).not.toBeInTheDocument();
    await userEvent.selectOptions(region, 'Salt Coast');
    expect(await screen.findByText('No characters match these filters.')).toBeVisible();
    expect(seen).toContainEqual(expect.objectContaining({ regionId }));
  });
});
