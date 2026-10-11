/**
 * Attaches the bot's gateway listeners to the discord.js Client.
 *
 * Post-#300 the bot is a pure activity sensor -- no command registry, no
 * interaction router, and no shared event dispatcher to register through
 * (that v1 pipeline, along with its GraphQL/raw-archive forwarding, is gone).
 * mountActivity attaches client.on() listeners directly for messageCreate and
 * voiceStateUpdate plus a raw MESSAGE_REACTION_ADD Gateway dispatch; each
 * event is normalized to a SniffedEvent (normalize.ts) and enqueued (queue.ts) for POST to the
 * backend's /v1/ingest/discord-event (forward.ts), incrementing
 * member_activity_rollups.
 *
 * Gated by SNIFFER_ENABLED (default false, #91 item 2) -- prod safety while
 * the v2 ingest path is rolled out gradually.
 */

import { Events } from 'discord.js';
import type { Client, Message, VoiceState } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../log.js';
import {
  normalizeMessageCreate,
  normalizeReactionDispatch,
  VoiceSessionTracker,
} from './normalize.js';
import { deliverActivity } from './forward.js';

/**
 * Mount the sniffer's gateway listeners on `client` (call before login, same
 * as mountEventListeners). No-ops (with a log line) when SNIFFER_ENABLED is
 * not "true".
 *
 * @param voiceTracker - injectable for tests; defaults to a fresh tracker.
 */
export function mountActivity(
  client: Client,
  voiceTracker?: VoiceSessionTracker,
): void {
  if (!config.snifferEnabled) {
    logger.info(
      'Sniffer disabled (SNIFFER_ENABLED is not "true") -- gateway activity ' +
        'events will not be forwarded to /v1/ingest/discord-event',
    );
    return;
  }

  const tracker = voiceTracker ?? new VoiceSessionTracker();

  client.on('messageCreate', (message: Message) => {
    if (message.guildId !== config.guildId) {
      return;
    }
    const event = normalizeMessageCreate(message);
    if (event !== null) {
      deliverActivity(event);
    }
  });

  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (guildId !== config.guildId) {
      return;
    }
    const event = tracker.handleVoiceStateUpdate(oldState, newState);
    if (event !== null) {
      deliverActivity(event);
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
    const event = normalizeReactionDispatch(
      packet as unknown as Parameters<typeof normalizeReactionDispatch>[0],
      gatewaySessionId,
      rawClient.user?.id,
    );
    if (event !== null) {
      deliverActivity(event);
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
        recoveryEvents = tracker.reconcile(guild.voiceStates.cache.values());
        for (const event of recoveryEvents) {
          deliverActivity(event);
        }
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
