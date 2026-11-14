import { expect, it, vi } from 'vitest';
import { testConfig } from '../support/config.js';

const close = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const disposeHealth = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    name: 'health',
    stop: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
  }),
);
const activity = vi.hoisted(() => ({
  name: 'activity',
  stop: vi.fn().mockResolvedValue(undefined),
  drain: vi.fn().mockResolvedValue(undefined),
}));
const { client, mountShardHealth } = vi.hoisted(() => ({
  client: {
    once: vi.fn(),
    on: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
  mountShardHealth: vi.fn(() => disposeHealth),
}));

vi.mock('@discord/client.js', () => ({ createClient: () => client }));
vi.mock('@discord/activity/mount.js', () => ({
  mountActivity: vi.fn(() => activity),
}));
vi.mock('@discord/agent/mount.js', () => ({
  mountAgent: vi.fn().mockResolvedValue({ name: 'agent', stop: close, close }),
}));
vi.mock('@discord/health.js', () => ({ mountShardHealth }));
vi.mock('@discord/log.js', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { mountActivity } from '@discord/activity/mount.js';
import { mountAgent } from '@discord/agent/mount.js';
import { start } from '@discord/session.js';

it('logs in with heartbeat enabled and returns stop', async () => {
  const config = testConfig({ token: 'test-token', heartbeatEnabled: true });
  const session = await start({ config, installSignalHandlers: false });
  expect(mountShardHealth).toHaveBeenCalledWith(client, config, {
    heartbeatEnabled: true,
    exitOnTerminal: true,
    exit: expect.any(Function),
  });
  expect(mountActivity).toHaveBeenCalledWith(client, config, { gateway: disposeHealth });
  expect(mountAgent).toHaveBeenCalledWith(client, config, disposeHealth);
  expect(client.login).toHaveBeenCalledWith('test-token');
  await session.stop();
  expect(disposeHealth.stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalled();
  expect(client.destroy).toHaveBeenCalled();
  expect(activity.drain).toHaveBeenCalled();
});
