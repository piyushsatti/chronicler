import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

describe('discord eslint process.env restriction', () => {
  it('reports process.env in an ordinary src module and not in index.ts', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const sample = 'const x = process.env.FOO;\n';

    const [moduleResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/health.ts'),
    });
    expect(
      moduleResult?.messages.some(
        (message) => message.ruleId === 'no-restricted-properties',
      ),
    ).toBe(true);

    const [indexResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/index.ts'),
    });
    expect(
      indexResult?.messages.some(
        (message) => message.ruleId === 'no-restricted-properties',
      ),
    ).toBe(false);
  });
});

describe('discord eslint fetch and secret restrictions', () => {
  it('reports fetch( outside api/http.ts and not inside it', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const sample = 'void fetch("http://example.test");\n';

    const [moduleResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/health.ts'),
    });
    expect(
      moduleResult?.messages.some((message) => message.ruleId === 'no-restricted-globals'),
    ).toBe(true);

    const [httpResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/api/http.ts'),
    });
    expect(
      httpResult?.messages.some((message) => message.ruleId === 'no-restricted-globals'),
    ).toBe(false);
  });

  it('reports the X-Ingest-Secret literal outside api/http.ts and not inside it', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const sample = 'const h = { "X-Ingest-Secret": "x" };\n';

    const [moduleResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/activity/mount.ts'),
    });
    expect(
      moduleResult?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(true);

    const [httpResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/api/http.ts'),
    });
    expect(
      httpResult?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(false);

    const [healthResult] = await eslint.lintText(sample, {
      filePath: path.join(repoRoot, 'apps/discord/src/health.ts'),
    });
    expect(
      healthResult?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(true);
  });

  it('reports shard on/once and Events.Shard* outside health.ts and not inside it', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const onSample = "client.on('shardReady', () => undefined);\n";
    const eventsSample = 'void Events.ShardDisconnect;\n';

    const [onOutside] = await eslint.lintText(onSample, {
      filePath: path.join(repoRoot, 'apps/discord/src/activity/mount.ts'),
    });
    expect(
      onOutside?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(true);

    const [eventsOutside] = await eslint.lintText(eventsSample, {
      filePath: path.join(repoRoot, 'apps/discord/src/agent/mount.ts'),
    });
    expect(
      eventsOutside?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(true);

    const [onInside] = await eslint.lintText(onSample, {
      filePath: path.join(repoRoot, 'apps/discord/src/health.ts'),
    });
    expect(
      onInside?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(false);

    const [eventsInside] = await eslint.lintText(eventsSample, {
      filePath: path.join(repoRoot, 'apps/discord/src/health.ts'),
    });
    expect(
      eventsInside?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(false);

    const [httpOn] = await eslint.lintText(onSample, {
      filePath: path.join(repoRoot, 'apps/discord/src/api/http.ts'),
    });
    expect(
      httpOn?.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
    ).toBe(true);
  });
});
