import { beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDeliveryPage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import type { GraphqlRequestBody } from '../../../src/chrome/featureModule.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import {
  DISCORD_GENERIC_REASON,
  DISCORD_PERMISSION_REASON,
} from '../../../src/utils/discordDelivery.js';

const delivery = {
  id: '11111111-1111-4111-8111-111111111111',
  questId: '22222222-2222-4222-8222-222222222222',
  questTitle: null, questShortCode: null, questLink: null, eventLink: null,
  messageId: null, state: 'queued', desiredRevision: 1, appliedRevision: 0,
  failureStreak: 1, maxAttempts: 8, nextAttemptAt: '2026-10-21T09:00:00Z', safeError: null,
  redriveCount: 0, createdAt: '2026-10-20T07:06:00Z', updatedAt: '2026-10-20T07:07:00Z',
};

const rows = [
  { ...delivery, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'dead', questTitle: 'Dead quest' },
  { ...delivery, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', state: 'repair_required', questTitle: 'Parked quest' },
  { ...delivery, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', state: 'retry_wait', questTitle: 'Waiting quest' },
  { ...delivery, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', state: 'succeeded', questTitle: 'Done quest' },
];

function rowFor(title: string): HTMLElement {
  const item = screen.getByText(title).closest('li');
  if (!item) throw new Error(`no row for ${title}`);
  return item;
}

beforeEach(() => signIn());

describe('delivery redrive', () => {
  it('offers Retry delivery only on dead and repair_required rows, and hides their next try', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps, deliveryTotal: rows.length, deliveries: rows,
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await screen.findByText('Dead quest');
    expect(within(rowFor('Dead quest')).getByRole('button', { name: 'Retry delivery' })).toBeEnabled();
    expect(within(rowFor('Parked quest')).getByRole('button', { name: 'Retry delivery' })).toBeEnabled();
    expect(within(rowFor('Waiting quest')).queryByRole('button', { name: 'Retry delivery' })).toBeNull();
    expect(within(rowFor('Done quest')).queryByRole('button', { name: 'Retry delivery' })).toBeNull();
    expect(within(rowFor('Parked quest')).queryByText(/Next try/)).toBeNull();
    expect(within(rowFor('Dead quest')).queryByText(/Next try/)).toBeNull();
    expect(within(rowFor('Waiting quest')).getByText(/Next try/)).toBeVisible();
  });

  it('explains each Discord failure in one sentence and stays quiet after success', async () => {
    const raw = 'discord api status 400: {"message":"Unknown Channel","code":10003}';
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        deliveryTotal: 6,
        scheduledWork: [{
          kind: 'gametime_fill',
          expectedSlot: '2026-10-21T00:00:00Z',
          outcome: 'failed',
          lastStartedAt: '2026-10-21T00:00:00Z',
          lastFinishedAt: '2026-10-21T00:01:00Z',
          jobId: null,
          safeErrorCode: 'DISCORD_NOT_CONFIGURED',
        }],
        deliveries: [
          { ...rows[2], safeError: 'DISCORD_NOT_FOUND', questTitle: 'Missing channel' },
          { ...rows[2], id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', safeError: 'DISCORD_RATE_LIMIT', questTitle: 'Rate limited' },
          { ...rows[2], id: 'abababab-abab-4aba-8aba-abababababab', safeError: 'DISCORD_UNAVAILABLE', questTitle: 'Discord down' },
          { ...rows[0], safeError: raw, questTitle: 'Unknown failure' },
          { ...rows[3], safeError: 'DISCORD_PERMISSION' },
          { ...delivery, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', state: 'dead', safeError: null, questTitle: 'No code' },
        ],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await screen.findByText('Missing channel');
    const missing = within(rowFor('Missing channel'));
    expect(missing.getByText('the quest channel or its post was not found')).toBeVisible();
    expect(missing.queryByText(/Unknown Channel|discord api|DISCORD_NOT_FOUND/)).toBeNull();
    expect(within(rowFor('Rate limited')).getByText('Discord is limiting how fast posts are sent')).toBeVisible();
    expect(within(rowFor('Discord down')).getByText('Discord was unavailable')).toBeVisible();
    const unknown = within(rowFor('Unknown failure'));
    expect(unknown.getByText(DISCORD_GENERIC_REASON)).toBeVisible();
    expect(unknown.queryByText(/Unknown Channel|10003|discord api/)).toBeNull();
    expect(within(rowFor('No code')).getByText(DISCORD_GENERIC_REASON)).toBeVisible();
    const done = within(rowFor('Done quest'));
    expect(done.queryByText(DISCORD_PERMISSION_REASON)).toBeNull();
    expect(done.queryByText(DISCORD_GENERIC_REASON)).toBeNull();
    const scheduled = within(rowFor('Gametime fill'));
    expect(scheduled.getByText('Discord posting is not set up for this community')).toBeVisible();
    expect(scheduled.queryByText('DISCORD_NOT_CONFIGURED')).toBeNull();
  });

  it('shows a scheduled job code that has no Discord sentence', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps,
        scheduledWork: [{
          kind: 'gametime_fill',
          expectedSlot: '2026-10-21T00:00:00Z',
          outcome: 'repair_required',
          lastStartedAt: null,
          lastFinishedAt: null,
          jobId: null,
          safeErrorCode: 'TIME_ANCHOR_UNCOVERED',
        }],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await screen.findByText('Gametime fill');
    expect(within(rowFor('Gametime fill')).getByText('TIME_ANCHOR_UNCOVERED')).toBeVisible();
  });

  it('names the missing bot permission for a DISCORD_PERMISSION row, never the raw code', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps, deliveryTotal: 1, deliveries: [{ ...rows[1], safeError: 'DISCORD_PERMISSION' }],
      } } }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await screen.findByText('Parked quest');
    const row = within(rowFor('Parked quest'));
    expect(row.getByText(DISCORD_PERMISSION_REASON)).toBeVisible();
    expect(row.queryByText(/DISCORD_PERMISSION/)).toBeNull();
  });

  it('redrives the row by job id with the fixed reason, then refreshes the list', async () => {
    const redrives: GraphqlRequestBody[] = [];
    let loads = 0;
    let redriven = false;
    mockGraphqlOps({
      AdminOperations: () => {
        loads += 1;
        return HttpResponse.json({ data: { adminOperations: {
          ...goodOps,
          deliveryTotal: 1,
          deliveries: [{ ...rows[1], state: redriven ? 'queued' : 'repair_required' }],
        } } });
      },
      RedriveDiscordDelivery: (body) => {
        redrives.push(body);
        redriven = true;
        return HttpResponse.json({ data: { redriveDiscordDelivery: {
          jobId: rows[1]!.id, desiredRevision: 1, appliedRevision: 0, deliveryStatus: 'queued',
        } } });
      },
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry delivery' }));
    expect(await screen.findByText('Delivery queued to try again.')).toBeVisible();
    expect(redrives).toHaveLength(1);
    expect(redrives[0]?.variables).toMatchObject({
      jobId: rows[1]!.id,
      reason: 'Admin retry from delivery panel',
      meta: { idempotencyKey: expect.any(String) },
    });
    await waitFor(() => expect(loads).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry delivery' })).toBeNull(),
    );
  });

  it('shows the API refusal and keeps the row retryable', async () => {
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: {
        ...goodOps, deliveryTotal: 1, deliveries: [rows[0]],
      } } }),
      RedriveDiscordDelivery: () => HttpResponse.json({
        errors: [{ message: 'delivery job cannot be redriven', extensions: { code: 'CONFLICT' } }],
      }),
    });
    renderWithProviders(<AdminDeliveryPage />, { route: '/admin/delivery' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry delivery' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry delivery' })).toBeEnabled();
  });
});
