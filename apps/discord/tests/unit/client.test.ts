import { describe, expect, it } from 'vitest';
import { GatewayIntentBits, Partials } from 'discord.js';
import { intentsFor } from '@discord/client.js';
import { testConfig } from '../support/config.js';

const cases: Array<{
  name: string;
  snifferEnabled: boolean;
  agentEnabled: boolean;
  intents: GatewayIntentBits[];
  partials: Partials[];
}> = [
  {
    name: 'activity off, agent off',
    snifferEnabled: false,
    agentEnabled: false,
    intents: [GatewayIntentBits.Guilds],
    partials: [],
  },
  {
    name: 'activity off, agent on',
    snifferEnabled: false,
    agentEnabled: true,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  },
  {
    name: 'activity on, agent off',
    snifferEnabled: true,
    agentEnabled: false,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [],
  },
  {
    name: 'activity on, agent on',
    snifferEnabled: true,
    agentEnabled: true,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  },
];

describe('intentsFor', () => {
  it.each(cases)('$name', ({ snifferEnabled, agentEnabled, intents, partials }) => {
    expect(intentsFor(testConfig({ snifferEnabled, agentEnabled }))).toEqual({
      intents,
      partials,
    });
  });
});
