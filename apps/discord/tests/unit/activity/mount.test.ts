/**
 * Tests for mount.ts — SNIFFER_ENABLED gating and direct client.on listeners
 * for the retained `/v1/ingest/discord-event` path.
 */

import { EventEmitter } from 'node:events';
import { ChannelType, Events, PermissionsBitField } from 'discord.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountActivity } from '@discord/activity/mount.js';
import { deliverActivity } from '@discord/activity/forward.js';
import type { GatewayEvent, GatewayState } from '@discord/health.js';
import { testConfig } from '../../support/config.js';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@discord/activity/forward.js', () => ({
  deliverActivity: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const enabledConfig = testConfig({ snifferEnabled: true, guildId: 'test-guild-id' });
const disabledConfig = testConfig({ snifferEnabled: false, guildId: 'test-guild-id' });

function channel(
  id: string,
  visible: boolean | null = true,
  type = ChannelType.GuildText,
) {
  const everyone = {
    id: 'test-guild-id',
    permissions: new PermissionsBitField(visible ? ['ViewChannel'] : []),
  };
  return {
    id,
    type,
    guild: { id: 'test-guild-id', roles: { everyone } },
    permissionsFor: () => (visible === null ? null : everyone.permissions),
  };
}

function gatewayFixture() {
  const channels = new Map([
    ['public', channel('public')],
    ['private', channel('private', false)],
    ['private-2', channel('private-2', false)],
    ['unknown', channel('unknown', null)],
    [
      'private-thread',
      Object.assign(channel('private-thread', true, ChannelType.PrivateThread), {
        parent: channel('public'),
      }),
    ],
  ]);
  const voiceStates = new Map();
  const client = Object.assign(new EventEmitter(), {
    user: { id: 'bot-1' },
    channels: { cache: channels },
    guilds: {
      cache: new Map([
        ['test-guild-id', { id: 'test-guild-id', voiceStates: { cache: voiceStates } }],
      ]),
    },
  });
  return { client, channels, voiceStates };
}

function message(channelId: string) {
  return {
    id: 'msg-9',
    channelId,
    guildId: 'test-guild-id',
    author: { id: 'user-9', bot: false },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

function reaction(channelId: string) {
  return {
    t: 'MESSAGE_REACTION_ADD',
    s: 2,
    d: {
      guild_id: 'test-guild-id',
      user_id: 'user-9',
      channel_id: channelId,
      message_id: '112233445566778899',
      member: { user: { bot: false } },
    },
  };
}

function voiceState(channelId: string | null, id = 'user-9') {
  return {
    id,
    channelId,
    guild: { id: 'test-guild-id' },
    member: { user: { bot: false } },
  };
}

function fakeGateway(): GatewayState & { emit: (event: GatewayEvent) => void } {
  const listeners = new Set<(event: GatewayEvent) => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

async function mountedGateway() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  const fixture = gatewayFixture();
  const gateway = fakeGateway();
  mountActivity(fixture.client as never, enabledConfig, { gateway });
  fixture.client.emit('raw', { t: 'READY', s: 1, d: { session_id: 'session-1' } }, 0);
  return { ...fixture, gateway, deliverActivity };
}

describe('mountActivity', () => {
  it('does not attach any listeners when SNIFFER_ENABLED is unset (default false)', async () => {
    const clientMock = { on: vi.fn() };

    mountActivity(clientMock as unknown as import('discord.js').Client, disabledConfig);

    expect(clientMock.on).not.toHaveBeenCalled();
  });

  it('attaches message, voice, and raw dispatch listeners when enabled', async () => {
    const clientMock = { on: vi.fn() };

    mountActivity(clientMock as unknown as import('discord.js').Client, enabledConfig);

    const registeredEvents = (clientMock.on as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0],
    );
    expect(registeredEvents).toEqual(
      expect.arrayContaining([
        'messageCreate',
        'voiceStateUpdate',
        'raw',
        Events.ChannelUpdate,
        Events.GuildRoleUpdate,
        Events.GuildAvailable,
      ]),
    );
    expect(registeredEvents).toHaveLength(6);
  });

  it('uses READY session identity to forward a reaction dispatch', async () => {
    const clientMock = {
      on: vi.fn(),
      user: { id: 'bot-1' },
      channels: { cache: new Map([['chan-9', channel('chan-9')]]) },
    };

    mountActivity(clientMock as unknown as import('discord.js').Client, enabledConfig);

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
      enabledConfig,
      expect.objectContaining({ kind: 'reaction', discord_user_id: 'user-9' }),
    );
  });

  it('posts a normalized messageCreate event', async () => {
    const clientMock = {
      on: vi.fn(),
      channels: { cache: new Map([['chan-9', channel('chan-9')]]) },
    };

    mountActivity(clientMock as unknown as import('discord.js').Client, enabledConfig);

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
      enabledConfig,
      expect.objectContaining({ event_id: 'msg-9', kind: 'message' }),
    );
  });

  it('does not forward messages or reactions in channels everyone cannot view', async () => {
    const { client, deliverActivity } = await mountedGateway();
    client.emit('messageCreate', message('private'));
    client.emit('raw', reaction('private'), 0);
    expect(deliverActivity).not.toHaveBeenCalled();

    client.emit('messageCreate', message('public'));
    client.emit('raw', reaction('public'), 0);
    expect(deliverActivity).toHaveBeenCalledTimes(2);
  });

  it('does not forward activity for unknown channel permissions', async () => {
    const { client, channels, deliverActivity } = await mountedGateway();
    const missingRole = channel('missing-role');
    Object.assign(missingRole.guild.roles, { everyone: undefined });
    channels.set('missing-role', missingRole);
    for (const channelId of ['unknown', 'uncached', 'missing-role']) {
      client.emit('messageCreate', message(channelId));
      client.emit('raw', reaction(channelId), 0);
      client.emit('voiceStateUpdate', voiceState(null), voiceState(channelId));
      vi.advanceTimersByTime(120_000);
      client.emit('voiceStateUpdate', voiceState(channelId), voiceState(null));
    }
    expect(deliverActivity).not.toHaveBeenCalled();
  });

  it('does not forward activity from a private thread with a public parent', async () => {
    const { client, deliverActivity } = await mountedGateway();
    client.emit('messageCreate', message('private-thread'));
    client.emit('raw', reaction('private-thread'), 0);
    expect(deliverActivity).not.toHaveBeenCalled();
  });

  it('closes public voice intervals when moving into private channels', async () => {
    const { client, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public'));
    vi.advanceTimersByTime(120_000);
    client.emit('voiceStateUpdate', voiceState('public'), voiceState('private'));
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({ channel_id: 'public', amount: 2 }),
    );
    vi.advanceTimersByTime(120_000);
    client.emit('voiceStateUpdate', voiceState('private'), voiceState(null));
    expect(deliverActivity).toHaveBeenCalledTimes(1);
  });

  it('starts public voice intervals when moving out of private channels', async () => {
    const { client, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('private'));
    vi.advanceTimersByTime(120_000);
    client.emit('voiceStateUpdate', voiceState('private'), voiceState('public'));
    expect(deliverActivity).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    client.emit('voiceStateUpdate', voiceState('public'), voiceState(null));
    expect(deliverActivity).toHaveBeenCalledTimes(1);
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({ channel_id: 'public', amount: 1 }),
    );
  });

  it('does not retain private voice intervals across private channel moves', async () => {
    const { client, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('private'));
    vi.advanceTimersByTime(120_000);
    client.emit('voiceStateUpdate', voiceState('private'), voiceState('private-2'));
    vi.advanceTimersByTime(120_000);
    client.emit('voiceStateUpdate', voiceState('private-2'), voiceState(null));
    expect(deliverActivity).not.toHaveBeenCalled();
  });

  it('discards a tracked voice interval when its channel becomes private', async () => {
    const { client, channels, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public'));
    vi.advanceTimersByTime(120_000);
    channels.set('public', channel('public', false));
    client.emit('voiceStateUpdate', voiceState('public'), voiceState('public'));
    channels.set('public', channel('public'));
    client.emit('voiceStateUpdate', voiceState('public'), voiceState(null));
    expect(deliverActivity).not.toHaveBeenCalled();
  });

  it.each([false, null])(
    'discards private voice time after a channel permission update to %s',
    async (visible) => {
      const { client, channels, voiceStates, deliverActivity } = await mountedGateway();
      const state = voiceState('public');
      voiceStates.set(state.id, state);
      client.emit(Events.VoiceStateUpdate, voiceState(null), state);
      vi.advanceTimersByTime(60_000);

      const oldChannel = channels.get('public');
      const changedChannel = channel('public', visible);
      Object.assign(changedChannel.guild, { voiceStates: { cache: voiceStates } });
      channels.set('public', changedChannel);
      client.emit(Events.ChannelUpdate, oldChannel, changedChannel);
      expect(deliverActivity).not.toHaveBeenCalled();

      vi.advanceTimersByTime(120_000);
      const restoredChannel = channel('public');
      Object.assign(restoredChannel.guild, { voiceStates: { cache: voiceStates } });
      channels.set('public', restoredChannel);
      client.emit(Events.ChannelUpdate, changedChannel, restoredChannel);
      vi.advanceTimersByTime(60_000);
      voiceStates.delete(state.id);
      client.emit(Events.VoiceStateUpdate, state, voiceState(null));
      expect(deliverActivity).toHaveBeenCalledTimes(1);
      expect(deliverActivity).toHaveBeenCalledWith(
        enabledConfig,
        expect.objectContaining({ channel_id: 'public', amount: 1 }),
      );
    },
  );

  it.each([false, null])(
    'discards private voice time after everyone role visibility becomes %s',
    async (visible) => {
      const { client, channels, voiceStates, deliverActivity } = await mountedGateway();
      const observedChannel = channel('public');
      channels.set('public', observedChannel);
      const everyone = observedChannel.guild.roles.everyone;
      const role = {
        ...everyone,
        guild: client.guilds.cache.get('test-guild-id'),
      };
      const state = voiceState('public');
      voiceStates.set(state.id, state);
      client.emit(Events.VoiceStateUpdate, voiceState(null), state);
      vi.advanceTimersByTime(60_000);

      everyone.permissions = new PermissionsBitField([]);
      if (visible === null) {
        Object.assign(observedChannel.guild.roles, { everyone: undefined });
      }
      client.emit(Events.GuildRoleUpdate, role, role);
      expect(deliverActivity).not.toHaveBeenCalled();

      vi.advanceTimersByTime(120_000);
      everyone.permissions = new PermissionsBitField(['ViewChannel']);
      Object.assign(observedChannel.guild.roles, { everyone });
      client.emit(Events.GuildRoleUpdate, role, role);
      vi.advanceTimersByTime(60_000);
      voiceStates.delete(state.id);
      client.emit(Events.VoiceStateUpdate, state, voiceState(null));
      expect(deliverActivity).toHaveBeenCalledTimes(1);
      expect(deliverActivity).toHaveBeenCalledWith(
        enabledConfig,
        expect.objectContaining({ channel_id: 'public', amount: 1 }),
      );
    },
  );

  it('reconciles only publicly visible voice channels', async () => {
    const { client, voiceStates, gateway, deliverActivity } = await mountedGateway();
    voiceStates.set('public-user', voiceState('public', 'public-user'));
    voiceStates.set('private-user', voiceState('private', 'private-user'));
    voiceStates.set('unknown-user', voiceState('unknown', 'unknown-user'));
    gateway.emit({ type: 'ready', first: true });
    vi.advanceTimersByTime(120_000);
    for (const [id, state] of voiceStates) {
      client.emit('voiceStateUpdate', state, voiceState(null, id));
    }
    expect(deliverActivity).toHaveBeenCalledTimes(1);
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({ channel_id: 'public', discord_user_id: 'public-user' }),
    );
  });

  it('forwards public recovery intervals during readiness reconciliation', async () => {
    const { client, gateway, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public'));
    vi.advanceTimersByTime(120_000);
    gateway.emit({ type: 'ready', first: true });
    expect(deliverActivity).toHaveBeenCalledTimes(1);
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({
        event_id: expect.stringContaining('voice:recovery:'),
        channel_id: 'public',
        amount: 2,
      }),
    );
  });

  it('discards private recovery intervals during readiness reconciliation', async () => {
    const { client, channels, gateway, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public'));
    vi.advanceTimersByTime(120_000);
    channels.set('public', channel('public', false));
    gateway.emit({ type: 'ready', first: true });
    expect(deliverActivity).not.toHaveBeenCalled();
    channels.set('public', channel('public'));
    client.emit('voiceStateUpdate', voiceState('public'), voiceState(null));
    expect(deliverActivity).not.toHaveBeenCalled();
  });

  it('reconciles voice on session_lost: opens joins from the gap and closes leaves', async () => {
    const { client, voiceStates, gateway, deliverActivity } = await mountedGateway();
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public', 'stale-user'));
    vi.advanceTimersByTime(120_000);
    voiceStates.set('gap-joiner', voiceState('public', 'gap-joiner'));
    gateway.emit({ type: 'session_lost', shardId: 0, gapMs: 500 });

    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({
        event_id: expect.stringContaining('voice:recovery:'),
        channel_id: 'public',
        discord_user_id: 'stale-user',
        amount: 2,
      }),
    );

    vi.advanceTimersByTime(60_000);
    const joined = voiceStates.get('gap-joiner');
    voiceStates.delete('gap-joiner');
    client.emit('voiceStateUpdate', joined, voiceState(null, 'gap-joiner'));
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({
        channel_id: 'public',
        discord_user_id: 'gap-joiner',
        amount: 1,
      }),
    );
  });

  it('defers session_lost reconcile until GuildAvailable when the guild is unavailable', async () => {
    const { client, gateway, deliverActivity } = await mountedGateway();
    const guild = client.guilds.cache.get('test-guild-id')!;
    Object.assign(guild, { available: false });
    client.emit('voiceStateUpdate', voiceState(null), voiceState('public', 'stale-user'));
    vi.advanceTimersByTime(120_000);
    gateway.emit({ type: 'session_lost', shardId: 0, gapMs: 500 });
    expect(deliverActivity).not.toHaveBeenCalled();

    client.emit(Events.GuildAvailable, guild);
    expect(deliverActivity).toHaveBeenCalledWith(
      enabledConfig,
      expect.objectContaining({
        event_id: expect.stringContaining('voice:recovery:'),
        channel_id: 'public',
        discord_user_id: 'stale-user',
        amount: 2,
      }),
    );
  });
});
