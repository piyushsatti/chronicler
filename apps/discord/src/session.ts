/**
 * Bot bootstrap — create the client, mount activity and the agent, and log in.
 *
 * Activity and the agent are independent listeners with independent feature
 * flags. There is no command registry, interaction router, or passive
 * content-reading surface.
 */

import { Events, type Client } from 'discord.js';
import { createClient } from './client.js';
import type { BotConfig } from './config.js';
import { mountAgent } from './agent/mount.js';
import { mountShardHealth, type ProcessExit } from './health.js';
import { mountActivity } from './activity/mount.js';
import { logger } from './log.js';

export interface StartOptions {
  config: BotConfig;
  /** Test seam: drive the composition root without a real Discord login. */
  client?: Client;
  /** Test seam: capture process.exit without killing the runner. */
  exit?: ProcessExit;
  /** Default true; tests pass false so handlers do not latch onto the runner. */
  installSignalHandlers?: boolean;
}

export interface StartedSession {
  stop(): Promise<void>;
}

/** Create the client, mount activity and the agent, and log in to Discord. */
export async function start(options: StartOptions): Promise<StartedSession> {
  const { config } = options;
  const client = options.client ?? createClient(config);
  mountActivity(client, config);
  const disposeHealth = mountShardHealth(client, config, {
    heartbeatEnabled: config.heartbeatEnabled,
    exitOnTerminal: true,
    exit: options.exit,
  });
  const agent = await mountAgent(client, config);

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Chronicler bot online', {
      tag: readyClient.user.tag,
      id: readyClient.user.id,
      guilds: readyClient.guilds.cache.size,
    });
  });

  await client.login(config.token);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    disposeHealth();
    await agent.close().finally(() => {
      client.destroy();
    });
  };

  if (options.installSignalHandlers ?? true) {
    process.once('SIGINT', () => {
      void stop();
    });
    process.once('SIGTERM', () => {
      void stop();
    });
  }

  return { stop };
}
