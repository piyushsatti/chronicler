import { expect, it, vi } from 'vitest';
import { testConfig } from '../support/config.js';

const close = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const disposeHealth = vi.hoisted(() => vi.fn());
const { client, mountShardHealth } = vi.hoisted(() => ({
  client: {
    once: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
  mountShardHealth: vi.fn(() => disposeHealth),
}));

vi.mock('@discord/client.js', () => ({ createClient: () => client }));
vi.mock('@discord/activity/mount.js', () => ({ mountActivity: vi.fn() }));
vi.mock('@discord/agent/mount.js', () => ({
  mountAgent: vi.fn().mockResolvedValue({ close }),
}));
vi.mock('@discord/health.js', () => ({ mountShardHealth }));
vi.mock('@discord/log.js', () => ({ logger: { info: vi.fn() } }));

import { start } from '@discord/session.js';

it('logs in with heartbeat enabled and returns stop', async () => {
  const config = testConfig({ token: 'test-token', heartbeatEnabled: true });
  const session = await start({ config, installSignalHandlers: false });
  expect(mountShardHealth).toHaveBeenCalledWith(client, config, {
    heartbeatEnabled: true,
    exitOnTerminal: true,
    exit: undefined,
  });
  expect(client.login).toHaveBeenCalledWith('test-token');
  await session.stop();
  expect(disposeHealth).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalled();
  expect(client.destroy).toHaveBeenCalled();
});
