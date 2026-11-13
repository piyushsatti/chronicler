import { beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDeliveryPage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';

const CHANNEL = '222222222222222222';
const ROLE = '333333333333333333';
const VOICE_A = '444444444444444444';
const VOICE_B = '555555555555555555';

beforeEach(() => signIn());

function mockSettings(
  saved: {
    announceChannelId: string | null;
    roleId: string | null;
    voiceChannels: { name: string; channelId: string }[];
  },
  onSave?: (input: unknown) => void,
) {
  mockGraphqlOps({
    AdminOperations: () => HttpResponse.json({ data: { adminOperations: goodOps } }),
    AdminDiscordSettings: () => HttpResponse.json({ data: { discordSettings: saved } }),
    UpdateDiscordSettings: (body) => {
      onSave?.(body.variables?.['input']);
      return HttpResponse.json({
        data: { updateDiscordSettings: body.variables?.['input'] },
      });
    },
  });
}

async function openPanel(findTimeout?: number) {
  renderWithProviders(<AdminDeliveryPage />, {
    route: '/admin/delivery?section=discord',
  });
  return screen.findByRole(
    'button',
    { name: 'Save Discord settings' },
    { timeout: findTimeout },
  );
}

describe('Discord settings panel', () => {
  it('shows what an admin saved: channel, role and the voice channel list', async () => {
    mockSettings({
      announceChannelId: CHANNEL,
      roleId: ROLE,
      voiceChannels: [
        { name: 'Table 1', channelId: VOICE_A },
        { name: 'Table 2', channelId: VOICE_B },
      ],
    });
    await openPanel(10_000);
    expect(
      await screen.findByLabelText('Announce channel ID', {}, { timeout: 10_000 }),
    ).toHaveValue(CHANNEL);
    expect(screen.getByLabelText('Quest role ID')).toHaveValue(ROLE);
    const list = within(screen.getByRole('list', { name: 'Voice channels' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText('Name 1')).toHaveValue('Table 1');
    expect(screen.getByLabelText('Channel ID 2')).toHaveValue(VOICE_B);
    // Saved settings and the filled announce field each wait 10s.
  }, 25_000);

  it('says plainly that no voice channels exist yet', async () => {
    mockSettings({ announceChannelId: null, roleId: null, voiceChannels: [] });
    await openPanel();
    expect(await screen.findByText(/No voice channels yet/)).toBeVisible();
    expect(screen.getByLabelText('Announce channel ID')).toHaveValue('');
  });

  it('names the rule and moves focus to the error summary when an id is wrong, and sends nothing', async () => {
    let saved = 0;
    mockSettings({ announceChannelId: null, roleId: null, voiceChannels: [] }, () => {
      saved += 1;
    });
    await openPanel();
    await userEvent.type(await screen.findByLabelText('Announce channel ID'), '12345');
    await userEvent.type(screen.getByLabelText('Quest role ID'), `${ROLE}x`);
    await userEvent.click(screen.getByRole('button', { name: 'Add voice channel' }));
    await userEvent.type(screen.getByLabelText('Channel ID 1'), VOICE_A);
    await userEvent.click(screen.getByRole('button', { name: 'Save Discord settings' }));

    const summary = await screen.findByRole('group', { name: 'Fields that need attention' });
    expect(summary).toHaveFocus();
    expect(within(summary).getByText(/3 things need attention/)).toBeVisible();
    expect(
      within(summary).getByText('Announce channel ID must be a Discord ID: 17 to 20 digits.'),
    ).toBeVisible();
    expect(within(summary).getByText(/Quest role ID must be a Discord ID/)).toBeVisible();
    expect(within(summary).getByText(/Voice channel 1 needs a name/)).toBeVisible();
    expect(saved).toBe(0);
  });

  it('refuses the same channel listed twice', async () => {
    mockSettings({
      announceChannelId: null,
      roleId: null,
      voiceChannels: [
        { name: 'Table 1', channelId: VOICE_A },
        { name: 'Table 2', channelId: VOICE_A },
      ],
    });
    await openPanel();
    await screen.findByLabelText('Name 1');
    await userEvent.click(screen.getByRole('button', { name: 'Save Discord settings' }));
    // Once in the summary and once beside the field.
    expect(await screen.findAllByText(/repeats the channel ID of voice channel 1/)).toHaveLength(2);
  });

  it('adds, edits and removes voice channels, then saves trimmed values', async () => {
    let sent: unknown;
    mockSettings(
      {
        announceChannelId: CHANNEL,
        roleId: null,
        voiceChannels: [{ name: 'Old table', channelId: VOICE_A }],
      },
      (input) => {
        sent = input;
      },
    );
    await openPanel();
    const name = await screen.findByLabelText('Name 1');
    await userEvent.clear(name);
    await userEvent.type(name, '  Table One  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add voice channel' }));
    await userEvent.type(screen.getByLabelText('Name 2'), 'Table Two');
    await userEvent.type(screen.getByLabelText('Channel ID 2'), ` ${VOICE_B} `);
    await userEvent.click(screen.getByRole('button', { name: 'Add voice channel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove voice channel 3' }));
    await userEvent.type(screen.getByLabelText('Quest role ID'), ROLE);
    await userEvent.click(screen.getByRole('button', { name: 'Save Discord settings' }));

    expect(await screen.findByText('Discord settings saved.')).toBeVisible();
    expect(sent).toEqual({
      announceChannelId: CHANNEL,
      roleId: ROLE,
      voiceChannels: [
        { name: 'Table One', channelId: VOICE_A },
        { name: 'Table Two', channelId: VOICE_B },
      ],
    });
  });

  it('clears the announce channel and role with empty fields', async () => {
    let sent: unknown;
    mockSettings(
      { announceChannelId: CHANNEL, roleId: ROLE, voiceChannels: [] },
      (input) => {
        sent = input;
      },
    );
    await openPanel();
    await userEvent.clear(await screen.findByLabelText('Announce channel ID'));
    await userEvent.clear(screen.getByLabelText('Quest role ID'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Discord settings' }));
    await waitFor(() =>
      expect(sent).toEqual({ announceChannelId: null, roleId: null, voiceChannels: [] }),
    );
  });

  it('says saving posts nothing to Discord', async () => {
    mockSettings({ announceChannelId: null, roleId: null, voiceChannels: [] });
    await openPanel();
    expect(
      await screen.findByText(/Nothing is posted to Discord when you save/),
    ).toBeVisible();
  });
});
