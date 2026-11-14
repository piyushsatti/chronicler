/**
 * Discord client factory — intents and partials configuration.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { BotConfig } from './config.js';

/**
 * Derive Gateway intents and partials from feature flags.
 * Guilds always; messages when activity or agent; reactions and voice with
 * activity; DMs, MessageContent, and Channel partial with the agent.
 * Enable MessageContent in the Developer Portal before agent deployment.
 * Activity still never reads content.
 * Intentionally excludes:
 *  - GuildScheduledEvents: zero consumers (the old events/ dispatcher this
 *    fed was vestigial and has been deleted).
 *  - GuildModeration: zero consumers (fed the deleted audit-log handler).
 */
export function intentsFor(c: BotConfig): {
  intents: GatewayIntentBits[];
  partials: Partials[];
} {
  const intents: GatewayIntentBits[] = [GatewayIntentBits.Guilds];
  if (c.snifferEnabled || c.agentEnabled) {
    intents.push(GatewayIntentBits.GuildMessages);
  }
  if (c.snifferEnabled) {
    intents.push(
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
    );
  }
  const partials: Partials[] = [];
  if (c.agentEnabled) {
    intents.push(GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent);
    partials.push(Partials.Channel);
  }
  return { intents, partials };
}

/** Create a discord.js Client with intents derived from the injected config. */
export function createClient(config: BotConfig): Client {
  const { intents, partials } = intentsFor(config);
  return new Client({ intents, partials });
}
