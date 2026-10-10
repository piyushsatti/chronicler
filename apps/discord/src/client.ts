/**
 * Discord client factory — intents and partials configuration.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';

/**
 * Create a discord.js Client with the intents required by activity and the
 * agent. The agent requests MessageContent so unmentioned guild replies have
 * readable text. Enable that permission in the Developer Portal before
 * deployment. Activity still never reads content.
 * Intentionally excludes:
 *  - GuildScheduledEvents: zero consumers (the old events/ dispatcher this
 *    fed was vestigial and has been deleted).
 *  - GuildModeration: zero consumers (fed the deleted audit-log handler).
 */
export function createClient(): Client {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    // Required for voiceStateUpdate, which activity needs for
    // voice-minute tracking. Not privileged.
    GatewayIntentBits.GuildVoiceStates,
  ];
  if (config.agentEnabled) {
    intents.push(GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent);
  }
  return new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  });
}
