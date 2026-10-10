import { describe, expect, it, vi } from 'vitest';
import { GatewayIntentBits } from 'discord.js';
const settings = vi.hoisted(() => ({ agentEnabled: true }));
vi.mock('@discord/config.js', () => ({ config: settings }));
import { createClient } from '@discord/client.js';

describe('agent reply content access', () => {
  it('requests content access for unmentioned guild replies when the agent is enabled', () => {
    settings.agentEnabled = true;
    const client = createClient();
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.DirectMessages)).toBe(true);
  });
  it('does not request content access for the sensor alone', () => {
    settings.agentEnabled = false;
    const client = createClient();
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false);
    settings.agentEnabled = true;
  });
});
