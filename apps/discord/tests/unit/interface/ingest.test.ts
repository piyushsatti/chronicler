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

const openApiPath = fileURLToPath(
  new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
);

interface PropertySchema {
  type?: string;
  enum?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
}

interface ObjectSchema {
  required: string[];
  properties: Record<string, PropertySchema>;
  additionalProperties: boolean;
}

function readSequence(
  block: string[],
  name: string,
  indent: number,
): string[] | undefined {
  const prefix = `${' '.repeat(indent)}${name}:`;
  const declaration = block.findIndex((line) => line.startsWith(prefix));
  if (declaration < 0) return undefined;

  const value = block[declaration]?.slice(prefix.length).trim();
  if (value === undefined) throw new Error(`schema ${name} is unreadable`);
  if (value.length > 0) {
    const inline = value.match(/^\[([^\]]*)\]$/);
    if (!inline) throw new Error(`schema ${name} must be a sequence`);
    return inline[1]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  const items: string[] = [];
  for (const line of block.slice(declaration + 1)) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) break;

    const item = line.match(new RegExp(`^ {${indent + 2}}-\\s+(.+?)\\s*$`));
    if (!item) throw new Error(`schema ${name} contains an unreadable item`);
    items.push(item[1]);
  }
  if (items.length === 0) throw new Error(`schema ${name} sequence is empty`);
  return items;
}

export function readObjectSchema(yaml: string, name: string): ObjectSchema {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `    ${name}:`);
  if (start < 0) throw new Error(`schema ${name} is missing from openapi.yaml`);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^ {4}[A-Za-z0-9]/.test(line)) break;
    block.push(line);
  }
  const required = readSequence(block, 'required', 6) ?? [];
  const properties: Record<string, PropertySchema> = {};
  let current: string | undefined;
  for (const [index, line] of block.entries()) {
    const property = line.match(/^ {8}([A-Za-z0-9_]+):\s*$/);
    if (property) {
      current = property[1];
      properties[current] = {};
      continue;
    }
    if (current === undefined) continue;
    const type = line.match(/^ {10}type:\s*(\w+)\s*$/);
    if (type) properties[current].type = type[1];
    if (/^ {10}enum:/.test(line)) {
      const values = readSequence(block.slice(index), 'enum', 10);
      if (values) properties[current].enum = values;
    }
    const format = line.match(/^ {10}format:\s*(\S+)\s*$/);
    if (format) properties[current].format = format[1];
    const minimum = line.match(/^ {10}minimum:\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (minimum) properties[current].minimum = Number(minimum[1]);
    const maximum = line.match(/^ {10}maximum:\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (maximum) properties[current].maximum = Number(maximum[1]);
  }
  return {
    required,
    properties,
    additionalProperties: block.some((line) =>
      /additionalProperties:\s*true/.test(line),
    ),
  };
}

export function schemaViolations(schema: ObjectSchema, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['body must be an object'];
  }
  const body = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of schema.required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      problems.push(`missing ${key}`);
    }
  }
  if (!schema.additionalProperties) {
    for (const key of Object.keys(body)) {
      if (!(key in schema.properties)) problems.push(`unexpected ${key}`);
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in body) || body[key] === undefined) continue;
    const field = body[key];
    if (property.type === 'string' && typeof field !== 'string')
      problems.push(`${key} must be a string`);
    if (property.type === 'number' && typeof field !== 'number')
      problems.push(`${key} must be a number`);
    if (property.type === 'integer') {
      if (typeof field !== 'number' || !Number.isInteger(field)) {
        problems.push(`${key} must be an integer`);
      }
    }
    if (property.type === 'boolean' && typeof field !== 'boolean')
      problems.push(`${key} must be a boolean`);
    if (
      property.type === 'object' &&
      (typeof field !== 'object' || field === null || Array.isArray(field))
    ) {
      problems.push(`${key} must be an object`);
    }
    if (
      property.minimum !== undefined &&
      typeof field === 'number' &&
      field < property.minimum
    ) {
      problems.push(`${key} must be >= ${property.minimum}`);
    }
    if (
      property.maximum !== undefined &&
      typeof field === 'number' &&
      field > property.maximum
    ) {
      problems.push(`${key} must be <= ${property.maximum}`);
    }
    if (property.enum && !property.enum.includes(String(field))) {
      problems.push(`${key} must be one of ${property.enum.join(', ')}`);
    }
    if (
      property.format === 'date-time' &&
      (typeof field !== 'string' || Number.isNaN(Date.parse(field)))
    ) {
      problems.push(`${key} must be a date-time`);
    }
  }
  return problems;
}

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
