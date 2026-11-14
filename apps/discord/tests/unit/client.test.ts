import { describe, expect, it } from 'vitest';
import { GatewayIntentBits } from 'discord.js';
import { createClient } from '@discord/client.js';
import { testConfig } from '../support/config.js';

describe('agent reply content access', () => {
  it('requests content access for unmentioned guild replies when the agent is enabled', () => {
    const client = createClient(testConfig({ agentEnabled: true }));
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(true);
    expect(client.options.intents.has(GatewayIntentBits.DirectMessages)).toBe(true);
  });
  it('does not request content access for the sensor alone', () => {
    const client = createClient(testConfig({ agentEnabled: false }));
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false);
  });
});
