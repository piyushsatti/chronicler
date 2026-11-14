/**
 * Attaches gateway listeners on the discord.js Client for the activity sensor.
 *
 * No command registry, interaction router, GraphQL client, or announce path.
 * Listeners cover messageCreate, voiceStateUpdate, and raw MESSAGE_REACTION_ADD;
 * each accepted payload becomes a SniffedEvent (normalize.ts) and is enqueued on
 * ActivityForwarder (forward.ts) for `/v1/ingest/discord-event`.
 *
 * Gated by SNIFFER_ENABLED (default false).
 */

import { Events } from 'discord.js';
import type { Client, Guild, Message, VoiceState } from 'discord.js';
import { createHttp } from '../api/http.js';
import { createIngest } from '../api/ingest.js';
import type { BotConfig } from '../config.js';
import type { GatewayState } from '../health.js';
import type { Stoppable } from '../lifecycle.js';
import { logger } from '../log.js';
import { ActivityForwarder } from './forward.js';
import {
  isPublicActivityChannel,
  normalizeMessageCreate,
  normalizeReactionDispatch,
  VoiceSessionTracker,
} from './normalize.js';
import type { SniffedEvent } from './types.js';

export interface MountActivityOptions {
  voiceTracker?: VoiceSessionTracker;
  gateway?: GatewayState;
  forwarder?: { enqueue(e: SniffedEvent): void; drain?(deadlineAt: number): Promise<unknown> };
}

export interface MountedActivity extends Stoppable {
  drain(deadlineAt: number): Promise<void>;
}

/**
 * Mount gateway listeners on `client` (call before login). No-ops (with a
 * log line) when SNIFFER_ENABLED is not "true".
 */
export function mountActivity(
  client: Client,
  config: BotConfig,
  options: MountActivityOptions = {},
): MountedActivity {
  if (!config.snifferEnabled) {
    logger.info(
      'Sniffer disabled (SNIFFER_ENABLED is not "true") -- gateway activity ' +
        'events will not be forwarded to /v1/ingest/discord-event',
    );
    return {
      name: 'activity',
      async stop() {
        return;
      },
      async drain() {
        return;
      },
    };
  }

  const forwarder =
    options.forwarder ??
    new ActivityForwarder({
      ingest: createIngest(
        createHttp({
          apiUrl: config.apiUrl,
          secret: config.ingestSecret,
        }),
      ),
      now: Date.now,
    });

  const tracker =
    options.voiceTracker ??
    new VoiceSessionTracker({
      getChannel: (channelId) => client.channels.cache.get(channelId),
    });

  const reconcileVoiceSessions = (guild: Guild) => {
    const events = tracker.reconcile(guild.voiceStates.cache.values());
    for (const event of events) {
      forwarder.enqueue(event);
    }
    return events;
  };

  let awaitingGuild = false;

  const runReconcile = (guild: Guild): void => {
    let recoveryEvents: ReturnType<VoiceSessionTracker['reconcile']> = [];
    try {
      recoveryEvents = reconcileVoiceSessions(guild);
    } catch (error: unknown) {
      logger.error('Sniffer voice reconciliation failed', {
        guildId: guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    logger.info('Sniffer voice sessions reconciled after gateway readiness', {
      guildId: guild.id,
      recoveredEvents: recoveryEvents.length,
      activeSessions: trackerSessionCount(tracker),
    });
  };

  const reconcileConfiguredGuild = (): void => {
    const guild = client.guilds.cache.get(config.guildId);
    if (guild === undefined || guild.available === false) {
      awaitingGuild = true;
      if (guild === undefined) {
        logger.warn(
          'Sniffer voice reconciliation skipped: configured guild is unavailable',
          {
            guildId: config.guildId,
          },
        );
      }
      return;
    }
    awaitingGuild = false;
    runReconcile(guild);
  };

  client.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
    if ('guild' in newChannel && newChannel.guild.id === config.guildId) {
      try {
        reconcileVoiceSessions(newChannel.guild);
      } catch (error: unknown) {
        logger.error('Sniffer voice reconciliation failed', {
          guildId: newChannel.guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  client.on(Events.GuildRoleUpdate, (_oldRole, newRole) => {
    if (newRole.guild.id === config.guildId && newRole.id === newRole.guild.id) {
      try {
        reconcileVoiceSessions(newRole.guild);
      } catch (error: unknown) {
        logger.error('Sniffer voice reconciliation failed', {
          guildId: newRole.guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  client.on('messageCreate', (message: Message) => {
    if (
      message.guildId !== config.guildId ||
      !isPublicActivityChannel(client.channels.cache.get(message.channelId))
    ) {
      return;
    }
    const event = normalizeMessageCreate(message);
    if (event !== null) {
      forwarder.enqueue(event);
    }
  });

  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (guildId !== config.guildId) {
      return;
    }
    for (const event of tracker.handleVoiceStateUpdate(oldState, newState)) {
      forwarder.enqueue(event);
    }
  });

  // The high-level messageReactionAdd callback does not expose the Gateway
  // sequence, so it cannot distinguish a genuine remove/re-add from replay.
  // Raw dispatches do. Hash the current session id plus the sequence in the
  // normalizer, retaining stable replay identity without persisting the
  // resumable Discord session id itself.
  const gatewaySessionIds = new Map<number, string>();
  const rawClient = client as unknown as {
    user?: { id?: string };
    on: (
      event: string,
      listener: (packet: Record<string, unknown>, shardId: number) => void,
    ) => unknown;
  };
  rawClient.on(Events.Raw, (packet, shardId) => {
    const data = packet['d'];
    if (packet['t'] === 'READY' && data !== null && typeof data === 'object') {
      const sessionId = (data as Record<string, unknown>)['session_id'];
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        gatewaySessionIds.set(shardId, sessionId);
      }
      return;
    }
    const gatewaySessionId = gatewaySessionIds.get(shardId);
    if (
      packet['t'] !== 'MESSAGE_REACTION_ADD' ||
      gatewaySessionId === undefined ||
      data === null ||
      typeof data !== 'object' ||
      (data as Record<string, unknown>)['guild_id'] !== config.guildId
    ) {
      return;
    }
    const channelId = (data as Record<string, unknown>)['channel_id'];
    if (
      typeof channelId !== 'string' ||
      !isPublicActivityChannel(client.channels.cache.get(channelId))
    ) {
      return;
    }
    const event = normalizeReactionDispatch(
      packet as unknown as Parameters<typeof normalizeReactionDispatch>[0],
      gatewaySessionId,
      rawClient.user?.id,
    );
    if (event !== null) {
      forwarder.enqueue(event);
    }
  });

  client.on(Events.GuildAvailable, (guild) => {
    if (guild.id === config.guildId && awaitingGuild) {
      awaitingGuild = false;
      runReconcile(guild);
    }
  });

  const unsubscribe = options.gateway?.subscribe((event) => {
    if (event.type === 'ready' || event.type === 'session_lost') {
      reconcileConfiguredGuild();
    }
  });

  logger.info(
    'Sniffer mounted -- forwarding messageCreate/voiceStateUpdate/raw MESSAGE_REACTION_ADD ' +
      'to /v1/ingest/discord-event',
  );

  return {
    name: 'activity',
    async stop() {
      unsubscribe?.();
      const events = tracker.closeAll(Date.now());
      for (const event of events) {
        forwarder.enqueue(event);
      }
    },
    async drain(deadlineAt: number) {
      if (typeof forwarder.drain === 'function') {
        await forwarder.drain(deadlineAt);
      }
    },
  };
}

function trackerSessionCount(tracker: VoiceSessionTracker): number {
  // The tracker intentionally keeps its storage abstraction private; this
  // count is only an operator-facing hint and does not affect reconciliation.
  return tracker.sessionCount();
}
