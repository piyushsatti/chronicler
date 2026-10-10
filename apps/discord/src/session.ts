/**
 * Bot bootstrap — create the client, mount activity and the agent, and log in.
 *
 * Activity and the agent are independent listeners with independent feature
 * flags. There is no command registry, interaction router, or passive
 * content-reading surface.
 */

import { Events, type Client } from 'discord.js';
import { createClient } from './client.js';
import { config } from './config.js';
import { mountAgent } from './agent/mount.js';
import { mountShardHealth, type ProcessExit } from './health.js';
import { mountActivity } from './activity/mount.js';
import { logger } from './log.js';

export interface StartOptions {
  /** Test seam: drive the composition root without a real Discord login. */
  client?: Client;
  /** Test seam: capture process.exit without killing the runner. */
  exit?: ProcessExit;
}

export interface StartedSession {
  stop(): Promise<void>;
}

/** Create the client, mount activity and the agent, and log in to Discord. */
export async function start(options: StartOptions = {}): Promise<StartedSession> {
  const client = options.client ?? createClient();
  mountActivity(client);
  const disposeHealth = mountShardHealth(client, {
    heartbeatEnabled: config.heartbeatEnabled,
    exitOnTerminal: true,
    exit: options.exit,
  });
  const agent = await mountAgent(client);

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

  if (!process.env['VITEST'] && options.client === undefined) {
    process.once('SIGINT', () => {
      void stop();
    });
    process.once('SIGTERM', () => {
      void stop();
    });
  }

  return { stop };
}
