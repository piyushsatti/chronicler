/**
 * Production Compose must declare a bot container healthcheck.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const composePath = path.join(repoRoot, 'deploy/compose.production.yaml');

describe('compose.production.yaml bot healthcheck', () => {
  it('declares healthcheck.js on the discord bot service', () => {
    const yaml = readFileSync(composePath, 'utf8');
    const botStart = yaml.indexOf('chronicler-discord-bot:');
    expect(botStart).toBeGreaterThanOrEqual(0);
    const nextService = yaml.indexOf('\n  chronicler-', botStart + 1);
    const botBlock = nextService === -1 ? yaml.slice(botStart) : yaml.slice(botStart, nextService);

    expect(botBlock).toContain('healthcheck:');
    expect(botBlock).toContain("test: ['CMD', 'bun', 'apps/discord/dist/healthcheck.js']");
    expect(botBlock).toContain('interval: 30s');
    expect(botBlock).toContain('start_period: 90s');
    expect(botBlock).toContain('retries: 3');
  });
});
