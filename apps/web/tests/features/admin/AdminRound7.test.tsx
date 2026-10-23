import { beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { AdminTodayBody } from '../../../src/features/admin/pages/AdminPage.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AdminDataHealthPage,
  AdminDeliveryPage,
  AdminPeoplePage,
  AdminWorldPage,
} from '../../../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import goodMembers from '../../fixtures/wire/admin/members-good.json';

beforeEach(() => signIn());

describe('Round 7 admin surfaces', () => {
  it('shows real health totals and destination-specific fix links without delivery tiles', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlertCount: 2,
        config: { ...goodOps.config, publicOriginHealthy: true, announcementRoleHealthy: true },
        activeAlerts: [
          goodOps.activeAlerts[0],
          { ...goodOps.activeAlerts[0], key: 'membership', label: 'Membership needs repair', severity: 'error', remediationHref: '/admin/people' },
        ],
      } } }),
    });
    renderWithProviders(<AdminDataHealthPage />, { route: '/admin/data-health' });
    expect(await screen.findByText('2 active alerts')).toBeVisible();
    expect(screen.getByText('2 configuration checks healthy.')).toBeVisible();
    expect(screen.queryByText('Pending deliveries')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review delivery' })).toHaveAttribute('href', '/admin/delivery');
    expect(screen.getByRole('link', { name: 'Review members' })).toHaveAttribute('href', '/admin/people');
    expect(screen.getByText('Warning', { exact: true })).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByText('Error', { exact: true })).toHaveAttribute('data-tone', 'danger');
    await userEvent.click(screen.getByRole('button', { name: /^Severity/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Error/ }));
    expect(screen.queryByText('Delivery lag')).not.toBeInTheDocument();
    expect(screen.getByText('Membership needs repair')).toBeVisible();
    expect(screen.getByText('2 active alerts')).toBeVisible();
  });

  it('explains unavailable repair directions instead of linking diagnostics to itself', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlerts: [{ ...goodOps.activeAlerts[0], remediationHref: '/admin/data-health?alert=delivery-lag#details' }],
      } } }),
    });
    renderWithProviders(<AdminDataHealthPage />, { route: '/admin/data-health' });
    const alerts = within(await screen.findByRole('list', { name: 'Active alerts' }));
    expect(alerts.getByText('Delivery lag')).toBeVisible();
    expect(alerts.getByText('Repair instructions and a separate destination are not provided.')).toBeVisible();
    expect(alerts.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links Today to provided diagnostics without describing them as a repair surface', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlerts: [{ ...goodOps.activeAlerts[0], remediationHref: '/admin/data-health' }],
      } } }),
    });
    renderWithProviders(<AdminTodayBody />, { route: '/admin' });
    const alerts = within(await screen.findByRole('list', { name: 'Active alerts' }));
    expect(alerts.getByRole('link', { name: 'Review diagnostics' })).toHaveAttribute('href', '/admin/data-health');
    expect(alerts.queryByText(/Repair instructions/)).not.toBeInTheDocument();
  });

  it('keeps unknown destinations neutral and excludes unsafe destination links', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlertCount: 2,
        activeAlerts: [
          { ...goodOps.activeAlerts[0], remediationHref: '/help/diagnostics' },
          { ...goodOps.activeAlerts[0], key: 'unsafe', label: 'Unsafe destination', remediationHref: '//elsewhere.example/repair' },
        ],
      } } }),
    });
    renderWithProviders(<AdminDataHealthPage />, { route: '/admin/data-health' });
    const alerts = within(await screen.findByRole('list', { name: 'Active alerts' }));
    expect(alerts.getByRole('link', { name: 'Review linked page' })).toHaveAttribute('href', '/help/diagnostics');
    expect(alerts.getAllByRole('link')).toHaveLength(1);
    expect(alerts.queryByRole('link', { name: /fix|repair/i })).not.toBeInTheDocument();
    expect(alerts.getByText('Repair instructions and a separate destination are not provided.')).toBeVisible();
  });

  it('keeps the chosen severity visible when the next page has no matching alerts', async () => {
    mockGraphqlOps({
      AdminOperations: (body) => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlertCount: 26,
        activeAlerts: body.variables?.alertsOffset === 25
          ? [{ ...goodOps.activeAlerts[0], key: 'error', label: 'Delivery failed', severity: 'error' }]
          : Array.from({ length: 25 }, (_, index) => ({
            ...goodOps.activeAlerts[0], key: `warning-${index}`, label: `Delivery warning ${index + 1}`,
          })),
      } } }),
    });
    renderWithProviders(<AdminDataHealthPage />, { route: '/admin/data-health' });
    await screen.findByText('26 active alerts');
    await userEvent.click(screen.getByRole('button', { name: /^Severity/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Warning/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No alerts with this severity on this page.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Severity/ })).toHaveTextContent('Warning');
    await userEvent.click(screen.getByRole('button', { name: 'Show all severities' }));
    expect(screen.getByText('Delivery failed')).toBeVisible();
  });

  it('gives all-clear checks a refresh action without inventing unobserved health', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        activeAlertCount: 0,
        activeAlerts: [],
        config: { ...goodOps.config, publicOriginHealthy: null, announcementRoleHealthy: null },
      } } }),
    });
    renderWithProviders(<AdminDataHealthPage />, { route: '/admin/data-health' });
    expect(await screen.findByText('All clear. No problems are being reported.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    expect(screen.queryByText(/configuration checks? healthy/)).not.toBeInTheDocument();
  });

  it('shows the returned quest target, creation time and tinted state without duplicate alerts', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        deliveries: [{
          id: '11111111-1111-4111-8111-111111111111',
          questId: '22222222-2222-4222-8222-222222222222',
          questTitle: 'The amber road', questShortCode: 'road', questLink: '/quests/road',
          eventLink: 'https://discord.com/events/123/456', messageId: null,
          state: 'repair_required', desiredRevision: 2, appliedRevision: 1,
          failureStreak: 1, maxAttempts: 5, nextAttemptAt: '2099-01-01T00:00:00Z',
          safeError: 'Discord could not accept this announcement.', redriveCount: 0,
          createdAt: '2026-10-20T07:06:00Z', updatedAt: '2026-10-20T07:07:00Z',
        }],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    const deliveries = within(await screen.findByRole('region', { name: 'Deliveries' }));
    expect(deliveries.getByText('The amber road')).toBeVisible();
    expect(deliveries.getByText('Discord quest announcement')).toBeVisible();
    expect(deliveries.getByText(/Created .*2026/)).toBeVisible();
    expect(deliveries.getByText('Needs repair')).toHaveAttribute('data-tone', 'danger');
    expect(deliveries.getByRole('link', { name: 'Open quest' })).toHaveAttribute('href', '/quests/road');
    expect(deliveries.getByRole('link', { name: 'Open Discord event' })).toHaveAttribute('href', 'https://discord.com/events/123/456');
    expect(deliveries.queryByText(/2099|11111111|revision 2/)).not.toBeInTheDocument();
    expect(screen.queryByText('Delivery lag')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1 active alert' })).toHaveAttribute('href', '/admin/data-health');
  });

  it('keeps world subsection counts and kind filtering in one FilterBar', async () => {
    renderWithProviders(<AdminWorldPage />, { route: '/admin/world' });
    const filter = within(await screen.findByRole('region', { name: 'World sections' }));
    expect(await filter.findByRole('button', { name: /^Regions\s+1$/ })).toBeVisible();
    expect(filter.getByRole('button', { name: /^Time anchors/ })).toBeVisible();
    expect(filter.getByRole('button', { name: /^Calendar/ })).toBeVisible();
    expect(filter.getByRole('button', { name: /^Region kind/ })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Filter regions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All kinds' })).not.toBeInTheDocument();
    await userEvent.click(filter.getByRole('button', { name: /^Time anchors/ }));
    expect(await screen.findByRole('button', { name: 'New anchor' })).toBeVisible();
    expect(screen.getByText(/^Game day 1/)).toBeVisible();
    expect(screen.queryByText('2026-01-01T00:00:00Z')).not.toBeInTheDocument();
    expect(filter.queryByRole('button', { name: /^Region kind/ })).not.toBeInTheDocument();
  });

  it('disambiguates shared names and exposes full truncated labels', async () => {
    mockGraphqlOps({
      AdminMembers: () => HttpResponse.json({ data: { members: {
        ...goodMembers,
        items: goodMembers.items.map((member) => ({ ...member, displayName: 'Adventurer' })),
      } } }),
    });
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    expect(await screen.findByRole('button', { name: /Adventurer \(@mira\)/ })).toHaveAttribute('title', 'Adventurer (@mira)');
    expect(screen.getByRole('button', { name: /Adventurer \(@ashwin\)/ })).toHaveAttribute('title', 'Adventurer (@ashwin)');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
