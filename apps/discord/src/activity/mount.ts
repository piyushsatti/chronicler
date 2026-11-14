/**
 * Attaches gateway listeners on the discord.js Client for the activity sensor.
 *
 * No command registry, interaction router, GraphQL client, or announce path.
 * Listeners cover messageCreate, voiceStateUpdate, and raw MESSAGE_REACTION_ADD;
 * each accepted payload becomes a SniffedEvent (normalize.ts) and is POSTed via
 * deliverActivity (forward.ts) to Go `/v1/ingest/discord-event`.
 *
 * Gated by SNIFFER_ENABLED (default false).
 */

import { Events } from 'discord.js';
import type { Client, Guild, Message, VoiceState } from 'discord.js';
import type { BotConfig } from '../config.js';
import { logger } from '../log.js';
import {
  isPublicActivityChannel,
  normalizeMessageCreate,
  normalizeReactionDispatch,
  VoiceSessionTracker,
} from './normalize.js';
import { deliverActivity } from './forward.js';

/**
 * Mount gateway listeners on `client` (call before login). No-ops (with a
 * log line) when SNIFFER_ENABLED is not "true".
 *
 * @param voiceTracker - injectable for tests; defaults to a fresh tracker.
 */
export function mountActivity(
  client: Client,
  config: BotConfig,
  voiceTracker?: VoiceSessionTracker,
): void {
  if (!config.snifferEnabled) {
    logger.info(
      'Sniffer disabled (SNIFFER_ENABLED is not "true") -- gateway activity ' +
        'events will not be forwarded to /v1/ingest/discord-event',
    );
    return;
  }

  const tracker =
    voiceTracker ??
    new VoiceSessionTracker({
      getChannel: (channelId) => client.channels.cache.get(channelId),
    });

  const reconcileVoiceSessions = (guild: Guild) => {
    const events = tracker.reconcile(guild.voiceStates.cache.values());
    for (const event of events) {
      deliverActivity(config, event);
    }
    return events;
  };

  client.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
    if ('guild' in newChannel && newChannel.guild.id === config.guildId) {
      reconcileVoiceSessions(newChannel.guild);
    }
  });

  client.on(Events.GuildRoleUpdate, (_oldRole, newRole) => {
    if (newRole.guild.id === config.guildId && newRole.id === newRole.guild.id) {
      reconcileVoiceSessions(newRole.guild);
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
      deliverActivity(config, event);
    }
  });

  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (guildId !== config.guildId) {
      return;
    }
    for (const event of tracker.handleVoiceStateUpdate(oldState, newState)) {
      deliverActivity(config, event);
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
      deliverActivity(config, event);
    }
  });

  // discord.js exposes the complete guild voice-state cache once the gateway
  // has identified. The optional `once` guard keeps lightweight test doubles
  // compatible while production reconciles the in-memory voice map.
  const clientWithOnce = client as Client & {
    once?: (event: string, listener: (readyClient: Client) => void) => Client;
  };
  if (typeof clientWithOnce.once === 'function') {
    clientWithOnce.once(Events.ClientReady, (readyClient) => {
      const guild = readyClient.guilds.cache.get(config.guildId);
      if (guild === undefined) {
        logger.warn(
          'Sniffer voice reconciliation skipped: configured guild is unavailable',
          {
            guildId: config.guildId,
          },
        );
        return;
      }
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
    });
  }

  logger.info(
    'Sniffer mounted -- forwarding messageCreate/voiceStateUpdate/raw MESSAGE_REACTION_ADD ' +
      'to /v1/ingest/discord-event',
  );
}

function trackerSessionCount(tracker: VoiceSessionTracker): number {
  // The tracker intentionally keeps its storage abstraction private; this
  // count is only an operator-facing hint and does not affect reconciliation.
  return tracker.sessionCount();
}
