/**
 * discord-ingest: activity and heartbeat bodies match packages/contracts/openapi.yaml.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  normalizeMessageCreate,
  normalizeReactionDispatch,
  VoiceSessionTracker,
} from '@discord/activity/normalize.js';

const openApiPath = fileURLToPath(
  new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
);

interface PropertySchema {
  type?: string;
  enum?: string[];
  format?: string;
}

interface ObjectSchema {
  required: string[];
  properties: Record<string, PropertySchema>;
  additionalProperties: boolean;
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
  const requiredMatch = block.join('\n').match(/required:\s*\[([^\]]*)\]/);
  const required = requiredMatch
    ? requiredMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : [];
  const properties: Record<string, PropertySchema> = {};
  let current: string | undefined;
  for (const line of block) {
    const property = line.match(/^ {8}([A-Za-z0-9_]+):\s*$/);
    if (property) {
      current = property[1];
      properties[current] = {};
      continue;
    }
    if (current === undefined) continue;
    const type = line.match(/^ {10}type:\s*(\w+)\s*$/);
    if (type) properties[current].type = type[1];
    const values = line.match(/^ {10}enum:\s*\[([^\]]*)\]\s*$/);
    if (values) {
      properties[current].enum = values[1]
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    }
    const format = line.match(/^ {10}format:\s*(\S+)\s*$/);
    if (format) properties[current].format = format[1];
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
  const tracker = new VoiceSessionTracker({ now: () => now });
  const member = { user: { bot: false } };
  tracker.handleVoiceStateUpdate(
    { id: 'user-1', channelId: null, member } as never,
    { id: 'user-1', channelId: 'chan-1', member } as never,
  );
  now = 120_000;
  return tracker.handleVoiceStateUpdate(
    { id: 'user-1', channelId: 'chan-1', member } as never,
    { id: 'user-1', channelId: null, member } as never,
  );
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

  it('a heartbeat body matches Heartbeat', () => {
    expect(
      schemaViolations(heartbeat, {
        gateway_ready: false,
        shard_state: {},
        host: 'local',
        build_sha: 'unknown',
      }),
    ).toEqual([]);
  });
});
