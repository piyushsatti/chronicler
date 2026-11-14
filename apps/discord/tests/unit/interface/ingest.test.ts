/**
 * discord-ingest: activity and heartbeat bodies match packages/contracts/openapi.yaml.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ChannelType, PermissionsBitField } from 'discord.js';
import {
  normalizeMessageCreate,
  normalizeReactionDispatch,
  VoiceSessionTracker,
} from '@discord/activity/normalize.js';
import type { HeartbeatStatus } from '@discord/health.js';
import { readObjectSchema, schemaViolations } from '../../support/openapi.js';

const openApiPath = fileURLToPath(
  new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
);

function messageEvent() {
  return normalizeMessageCreate({
    id: 'msg-1',
    channelId: 'chan-1',
    author: { id: 'user-1', bot: false },
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  } as never);
}

function voiceEvent() {
  let now = 0;
  const tracker = new VoiceSessionTracker({
    now: () => now,
    getChannel: () =>
      ({
        type: ChannelType.GuildVoice,
        guild: { roles: { everyone: { id: 'guild-1' } } },
        permissionsFor: () => new PermissionsBitField(['ViewChannel']),
      }) as never,
  });
  const member = { user: { bot: false } };
  tracker.handleVoiceStateUpdate(
    { id: 'user-1', channelId: null, member } as never,
    { id: 'user-1', channelId: 'chan-1', member } as never,
  );
  now = 120_000;
  return tracker.handleVoiceStateUpdate(
    { id: 'user-1', channelId: 'chan-1', member } as never,
    { id: 'user-1', channelId: null, member } as never,
  )[0];
}

function reactionEvent() {
  return normalizeReactionDispatch(
    { s: 4, d: { user_id: 'user-1', channel_id: 'chan-1', message_id: 'msg-1' } },
    'gateway-session',
    'bot-user',
    () => Date.parse('2026-07-01T12:00:00.000Z'),
  );
}

describe('discord-ingest', () => {
  const yaml = readFileSync(openApiPath, 'utf8');
  const discordEvent = readObjectSchema(yaml, 'DiscordEvent');
  const heartbeat = readObjectSchema(yaml, 'Heartbeat');

  it.each([
    [
      'inline sequences',
      `    TestEvent:
      type: object
      required: [event_id, kind]
      properties:
        event_id:
          type: string
        kind:
          type: string
          enum: [message, voice, reaction]`,
    ],
    [
      'block sequences',
      `    TestEvent:
      type: object
      required:
        - event_id
        - kind
      properties:
        event_id:
          type: string
        kind:
          type: string
          enum:
            - message
            - voice
            - reaction`,
    ],
  ])('%s retain required and enum constraints', (_format, schemaYaml) => {
    const schema = readObjectSchema(schemaYaml, 'TestEvent');
    const problems = schemaViolations(schema, { kind: 'announce' });

    expect(problems).toContain('missing event_id');
    expect(problems.some((problem) => problem.startsWith('kind must be one of'))).toBe(
      true,
    );
    expect(schemaViolations(schema, { event_id: 'event-1', kind: 'message' })).toEqual(
      [],
    );
  });

  it('reports declared sequences it cannot read', () => {
    expect(() =>
      readObjectSchema(
        `    TestEvent:
      required:
        event_id`,
        'TestEvent',
      ),
    ).toThrow('schema required contains an unreadable item');
    expect(() =>
      readObjectSchema(
        `    TestEvent:
      properties:
        kind:
          enum:
            message`,
        'TestEvent',
      ),
    ).toThrow('schema enum contains an unreadable item');
  });

  it('rejects a body the DiscordEvent schema does not allow', () => {
    expect(schemaViolations(discordEvent, { kind: 'announce' })).toContain(
      'missing event_id',
    );
    expect(
      schemaViolations(discordEvent, {
        event_id: '1',
        kind: 'announce',
        discord_user_id: 'user-1',
        channel_id: 'chan-1',
        occurred_at: '2026-07-01T12:00:00.000Z',
        amount: 1,
      }).some((problem) => problem.startsWith('kind must be one of')),
    ).toBe(true);
  });

  it('message, voice, and reaction reports match DiscordEvent', () => {
    for (const event of [messageEvent(), voiceEvent(), reactionEvent()]) {
      expect(schemaViolations(discordEvent, event)).toEqual([]);
    }
  });

  it.each([1.5, 0, 1441])(
    'rejects a voice event with amount %s',
    (amount) => {
      expect(schemaViolations(discordEvent, { ...voiceEvent(), amount }).length).toBeGreaterThan(
        0,
      );
    },
  );

  it('a heartbeat body matches Heartbeat', () => {
    const body: HeartbeatStatus = {
      gateway_ready: false,
      shard_state: {},
      host: 'local',
      build_sha: 'unknown',
    };
    expect(schemaViolations(heartbeat, body)).toEqual([]);
  });

  it.each([
    ['gateway_ready', 'ready'],
    ['shard_state', 'connected'],
  ] as const)('rejects a heartbeat with %s as a string', (field, value) => {
    expect(
      schemaViolations(heartbeat, {
        gateway_ready: false,
        shard_state: {},
        host: 'local',
        build_sha: 'unknown',
        [field]: value,
      }).length,
    ).toBeGreaterThan(0);
  });
});
