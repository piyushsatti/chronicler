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
import { mountShardHealth } from './health.js';
import { stopInOrder, type Stoppable } from './lifecycle.js';
import { mountActivity } from './activity/mount.js';
import { logger } from './log.js';
import { realProcess, type ProcessPort } from './process.js';

const STOP_BUDGET_MS = 12_000;

export interface StartOptions {
  config: BotConfig;
  /** Test seam: drive the composition root without a real Discord login. */
  client?: Client;
  /** Test seam: capture signals/exit without touching the runner process. */
  process?: ProcessPort;
  /** Test seam: override exit only; prefer `process` when faking signals too. */
  exit?: (code: number) => void;
  /** Default true; tests pass false so handlers do not latch onto the runner. */
  installSignalHandlers?: boolean;
}

export interface StartedSession {
  stop(): Promise<void>;
}

/** Create the client, mount activity and the agent, and log in to Discord. */
export async function start(options: StartOptions): Promise<StartedSession> {
  const { config } = options;
  const proc: ProcessPort =
    options.process ??
    (options.exit !== undefined
      ? {
          onSignal: (s, fn) => realProcess.onSignal(s, fn),
          onFatal: (fn) => realProcess.onFatal(fn),
          exit: options.exit,
        }
      : realProcess);
  const client = options.client ?? createClient(config);

  let stopping = false;
  const pending: { queue?: Stoppable[] } = {};

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (pending.queue === undefined) return;
    const deadlineAt = Date.now() + STOP_BUDGET_MS;
    await stopInOrder(pending.queue, deadlineAt);
  };

  if (options.installSignalHandlers ?? true) {
    const onSignal = (): void => {
      void stop().finally(() => {
        proc.exit(0);
      });
    };
    proc.onSignal('SIGINT', onSignal);
    proc.onSignal('SIGTERM', onSignal);
  }

  const health = mountShardHealth(client, config, {
    heartbeatEnabled: config.heartbeatEnabled,
    exitOnTerminal: true,
    exit: (code) => proc.exit(code),
  });
  const activity = mountActivity(client, config, { gateway: health });
  const agent = await mountAgent(client, config, health);

  client.on('error', (error: Error) => {
    logger.error('Discord client error', {
      error: error.message,
      stack: error.stack,
    });
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Chronicler bot online', {
      tag: readyClient.user.tag,
      id: readyClient.user.id,
      guilds: readyClient.guilds.cache.size,
    });
  });

  pending.queue = [
    agent,
    activity,
    health,
    {
      name: 'client',
      async stop() {
        client.destroy();
      },
    },
    {
      name: 'drain',
      async stop(at) {
        await activity.drain(at);
      },
    },
  ];

  await client.login(config.token);

  return { stop };
}
