import { beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDeliveryPage, AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import goodMembers from '../../fixtures/wire/admin/members-good.json';

const delivery = {
  id: '11111111-1111-4111-8111-111111111111',
  questId: '22222222-2222-4222-8222-222222222222',
  questTitle: null, questShortCode: null, questLink: null, eventLink: null,
  messageId: null, state: 'queued', desiredRevision: 1, appliedRevision: 0,
  failureStreak: 0, maxAttempts: 5, nextAttemptAt: null, safeError: null,
  redriveCount: 0, createdAt: '2026-10-20T07:06:00Z', updatedAt: '2026-10-20T07:07:00Z',
};

beforeEach(() => signIn());

describe('Round 9 admin lists', () => {
  it('keeps delivery filters and the visible count beside the list, preserving row labels', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        deliveryTotal: 2,
        deliveries: [
          delivery,
          { ...delivery, id: '22222222-2222-4222-8222-222222222222', state: 'succeeded' },
        ],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    const deliveries = within(await screen.findByRole('region', { name: 'Deliveries' }));
    const filter = within(deliveries.getByRole('region', { name: 'Filter deliveries' }));
    expect(filter.getByText('2 deliveries')).toBeVisible();
    expect(filter.getByText(/2 recorded/)).toBeVisible();
    expect(screen.getAllByText(/2 recorded/)).toHaveLength(1);
    const rows = within(deliveries.getByRole('list', { name: 'Deliveries' })).getAllByRole('listitem');
    const secondLabel = rows[1]?.querySelector('.type-title')?.textContent;
    await userEvent.click(filter.getByRole('button', { name: /^Status on this page/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delivered' }));
    expect(filter.getByText('1 delivery')).toBeVisible();
    expect(deliveries.getAllByRole('listitem')).toHaveLength(1);
    expect(deliveries.getByText(secondLabel ?? 'missing label')).toBeVisible();
    expect(filter.getByText(/2 recorded/)).toBeVisible();
  });

  it('retains a selected status and a zero count when the next delivery page has no match', async () => {
    mockGraphqlOps({
      AdminOperations: (body) => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        deliveryTotal: 26,
        deliveries: [{ ...delivery, state: body.variables?.offset === 25 ? 'succeeded' : 'queued' }],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    const filter = within(await screen.findByRole('region', { name: 'Filter deliveries' }));
    await userEvent.click(filter.getByRole('button', { name: /^Status on this page/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Queued' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('0 deliveries')).toBeVisible();
    const nextFilter = within(screen.getByRole('region', { name: 'Filter deliveries' }));
    expect(nextFilter.getByRole('button', { name: /^Status on this page/ })).toHaveTextContent('Queued');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(nextFilter.getByText('1 delivery')).toBeVisible();
    expect(screen.getByText('Delivered', { exact: true })).toBeVisible();
  });

  it('renders the entire distinguishing handle as visible member identity text', async () => {
    const handle = 'qa-admin-round-nine-long-distinguishing-handle';
    mockGraphqlOps({
      AdminMembers: () => HttpResponse.json({ data: { members: {
        ...goodMembers,
        items: [{ ...goodMembers.items[0], displayName: 'dev', handle }],
      } } }),
    });
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    const identity = `dev (@${handle})`;
    expect(await screen.findByText(identity)).toBeVisible();
  });
});
