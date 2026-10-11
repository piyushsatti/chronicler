/**
 * discord-sensor: the bot observes and forwards. It does not announce quests,
 * create scheduled events, call GraphQL, or open a database.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../../../src', import.meta.url));

/** Routes the sensor calls while the agent flag is off. */
const SENSOR_API_PATHS = ['/v1/ingest/discord-event', '/v1/ingest/heartbeat'];

/** Routes the agent module may call once AGENT_ENABLED turns it on. */
const AGENT_API_PATHS = [...SENSOR_API_PATHS, '/v1/agent/questions'];

const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  { name: 'graphql', pattern: /\bgraphql\b/i },
  { name: 'scheduled events', pattern: /scheduledEvents|GuildScheduledEvents/ },
  { name: 'database', pattern: /better-sqlite3|DATABASE_URL|\bprisma\b|postgres:\/\// },
  { name: 'quest announce', pattern: /announceQuest|quest_announce|quests\/announce/ },
];

export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      out += ' ';
      continue;
    }
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      out += quote;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

export function sensorViolations(
  source: string,
  allowed: readonly string[] = SENSOR_API_PATHS,
): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(code)) found.push(rule.name);
  }
  const paths = code.match(/\/v1\/[A-Za-z0-9_./{}-]*/g) ?? [];
  for (const apiPath of paths) {
    if (!allowed.includes(apiPath)) found.push(`undeclared route ${apiPath}`);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('discord-sensor', () => {
  it('rejects announce, scheduled-event, GraphQL, and database code', () => {
    expect(sensorViolations('guild.scheduledEvents.create()')).toContain(
      'scheduled events',
    );
    expect(sensorViolations("fetch('/v1/graphql')")).toContain('graphql');
    expect(sensorViolations("import Database from 'better-sqlite3'")).toContain(
      'database',
    );
    expect(sensorViolations("fetch('/v1/quests/announce')")).toContain(
      'undeclared route /v1/quests/announce',
    );
  });

  it('ignores the same words inside comments', () => {
    expect(
      sensorViolations('// GuildScheduledEvents was removed\nconst ok = 1;'),
    ).toEqual([]);
  });

  it('the default bot does not call the agent question route', () => {
    expect(sensorViolations("fetch('/v1/agent/questions')")).toContain(
      'undeclared route /v1/agent/questions',
    );
    const files = sourceFiles(srcRoot).filter(
      (file) => !file.includes(`${path.sep}agent${path.sep}`),
    );
    const violations = files.flatMap((file) =>
      sensorViolations(readFileSync(file, 'utf8')).map(
        (violation) => `${path.relative(srcRoot, file)}: ${violation}`,
      ),
    );
    expect(violations).toEqual([]);
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toContain('/v1/agent/questions');
    }
  });

  it('the agent module may call /v1/agent/questions when the flag turns it on', () => {
    expect(sensorViolations("fetch('/v1/agent/questions')", AGENT_API_PATHS)).toEqual(
      [],
    );
    const agentRoot = path.join(srcRoot, 'agent');
    const violations = sourceFiles(agentRoot).flatMap((file) =>
      sensorViolations(readFileSync(file, 'utf8'), AGENT_API_PATHS).map(
        (violation) => `${path.relative(srcRoot, file)}: ${violation}`,
      ),
    );
    expect(violations).toEqual([]);
    const mentionsAgent = sourceFiles(agentRoot).some((file) =>
      readFileSync(file, 'utf8').includes('/v1/agent/questions'),
    );
    expect(mentionsAgent).toBe(true);
  });
});
