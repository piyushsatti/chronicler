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
