import { describe, expect, it, vi } from 'vitest';
import { mountAgent } from '@discord/agent/mount.js';
import { testConfig } from '../../support/config.js';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('mountAgent flag', () => {
  it('does not attach messageCreate when AGENT_ENABLED is unset', async () => {
    const client = { on: vi.fn() };
    const mounted = await mountAgent(client as never, testConfig({ agentEnabled: false }));
    expect(client.on).not.toHaveBeenCalled();
    await mounted.close();
  });
});
