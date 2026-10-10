/**
 * Tests for sniffer/mount.ts (#91) -- SNIFFER_ENABLED gating and that the
 * sniffer attaches its own listeners independent of events/dispatcher.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@discord/activity/forward.js', () => ({
  deliverActivity: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function baseEnv(): void {
  vi.stubEnv('DISCORD_TOKEN', 'test-token');
  vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GUILD_ID', 'test-guild-id');
  vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
}

describe('mountActivity', () => {
  it('does not attach any listeners when SNIFFER_ENABLED is unset (default false)', async () => {
    baseEnv();
    vi.stubEnv('SNIFFER_ENABLED', '');

    const { mountActivity } = await import('@discord/activity/mount.js');
    const clientMock = { on: vi.fn() };

    mountActivity(clientMock as unknown as import('discord.js').Client);

    expect(clientMock.on).not.toHaveBeenCalled();
  });

  it('attaches message, voice, and raw dispatch listeners when enabled', async () => {
    baseEnv();
    vi.stubEnv('SNIFFER_ENABLED', 'true');

    const { mountActivity } = await import('@discord/activity/mount.js');
    const clientMock = { on: vi.fn() };

    mountActivity(clientMock as unknown as import('discord.js').Client);

    const registeredEvents = (clientMock.on as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0],
    );
    expect(registeredEvents).toEqual(
      expect.arrayContaining(['messageCreate', 'voiceStateUpdate', 'raw']),
    );
    expect(registeredEvents).toHaveLength(3);
  });

  it('uses READY session identity to forward a reaction dispatch', async () => {
    baseEnv();
    vi.stubEnv('SNIFFER_ENABLED', 'true');

    const { mountActivity } = await import('@discord/activity/mount.js');
    const { deliverActivity } = await import('@discord/activity/forward.js');
    const clientMock = { on: vi.fn(), user: { id: 'bot-1' } };

    mountActivity(clientMock as unknown as import('discord.js').Client);

    const rawHandler = (clientMock.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (args: unknown[]) => args[0] === 'raw',
    )?.[1] as (packet: unknown, shardId: number) => void;
    rawHandler({ t: 'READY', s: 1, d: { session_id: 'session-1' } }, 0);
    rawHandler(
      {
        t: 'MESSAGE_REACTION_ADD',
        s: 2,
        d: {
          guild_id: 'test-guild-id',
          user_id: 'user-9',
          channel_id: 'chan-9',
          message_id: '112233445566778899',
          member: { user: { bot: false } },
        },
      },
      0,
    );

    expect(deliverActivity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reaction', discord_user_id: 'user-9' }),
    );
  });

  it('posts a normalized messageCreate event', async () => {
    baseEnv();
    vi.stubEnv('SNIFFER_ENABLED', 'true');

    const { mountActivity } = await import('@discord/activity/mount.js');
    const { deliverActivity } = await import('@discord/activity/forward.js');
    const clientMock = { on: vi.fn() };

    mountActivity(clientMock as unknown as import('discord.js').Client);

    const messageCreateHandler = (
      clientMock.on as ReturnType<typeof vi.fn>
    ).mock.calls.find((args: unknown[]) => args[0] === 'messageCreate')?.[1] as (
      message: unknown,
    ) => void;

    messageCreateHandler({
      id: 'msg-9',
      channelId: 'chan-9',
      guildId: 'test-guild-id',
      author: { id: 'user-9', bot: false },
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(deliverActivity).toHaveBeenCalledTimes(1);
    expect(deliverActivity).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'msg-9', kind: 'message' }),
    );
  });
});
