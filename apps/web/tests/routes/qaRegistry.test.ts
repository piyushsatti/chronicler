import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import registryJson from '../../docs/parity/qa-route-registry.json';
import { ROUTE_MANIFEST_PATHS } from '../../src/routes/routeManifest.js';

type Registry = Omit<typeof registryJson, 'manifestCoverage' | 'reviewedReceipts'> & {
  reviewedReceipts: { id: string }[];
  manifestCoverage: (Omit<
    (typeof registryJson.manifestCoverage)[number],
    'verification'
  > & {
    verification: {
      status: string;
      receipts: string[];
      invalidatedReceipts: { id: string; reasons: string[] }[];
      remainingEvidence: string[];
    };
  })[];
};
const registry: Registry = registryJson;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const generator = 'apps/web/scripts/gen-qa-route-registry.mjs';
function generate(output?: string, check = false) {
  return execFileSync(
    process.execPath,
    [generator, ...(output ? ['--output', output] : []), ...(check ? ['--check'] : [])],
    { cwd: root, encoding: 'utf8' },
  );
}
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

describe('QA route coverage', () => {
  it('keeps the registry reproducible through the owning generator', () => {
    expect(generate(undefined, true)).toContain('95 manifest coverage entries');
  });

  it('accounts for every registered route without treating registration as acceptance', () => {
    expect(registry.manifestCoverage.map((route) => route.pattern)).toEqual([
      ...ROUTE_MANIFEST_PATHS,
    ]);
    expect(registry.manifestCoverage).toHaveLength(95);
    expect(new Set(registry.manifestCoverage.map((route) => route.pattern)).size).toBe(
      95,
    );
    for (const route of registry.manifestCoverage) {
      expect(route.actors.length, route.pattern).toBeGreaterThan(0);
      expect(route.actions.length, route.pattern).toBeGreaterThan(0);
      expect(route.requiredEvidence.length, route.pattern).toBeGreaterThan(0);
      expect(['pending', 'partial', 'verified']).toContain(route.verification.status);
      expect(route.requirementsSha256).toMatch(/^[a-f0-9]{64}$/);
      if (route.verification.status === 'verified') {
        expect(route.verification.receipts.length, route.pattern).toBeGreaterThan(0);
        expect(route.verification.remainingEvidence, route.pattern).toEqual([]);
      } else
        expect(
          route.verification.remainingEvidence.length,
          route.pattern,
        ).toBeGreaterThan(0);
      for (const id of route.verification.receipts)
        expect(registry.reviewedReceipts.some((receipt) => receipt.id === id)).toBe(
          true,
        );
      if ('target' in route)
        expect(route.target, route.pattern).not.toBe(route.pattern);
    }
  });

  it('describes implemented readers and retained diagnostics without stale placeholders or retired commands', () => {
    for (const route of registry.manifestCoverage) {
      expect(route.current).not.toBe('placeholder');
      expect(route.actions.join(' ')).not.toMatch(
        /\b(redrive|follow member|accept request|voice channel)\b/i,
      );
    }
    expect(
      registry.manifestCoverage.find((route) => route.pattern === '/regions')?.feature,
    ).toBe('map');
    expect(registry.routes.find((route) => route.path === '/map')?.expectText).toBe(
      'Lightfall Coast',
    );
    const gallery = registry.manifestCoverage.find(
      (route) => route.pattern === '/gallery',
    );
    expect(gallery?.access).toContain('current server admin-access proof');
    expect(gallery?.actors).toEqual(
      expect.arrayContaining([
        'guest',
        'configured-owner-without-staff-role',
        'revoked-staff',
      ]),
    );
    expect(gallery?.requiredEvidence).toEqual([
      'authority',
      'live-api',
      'responsive',
      'visual-review',
    ]);
    expect(
      registry.manifestCoverage.find((route) => route.pattern === '/editor-demo')
        ?.requiredEvidence,
    ).toEqual(['responsive', 'visual-review']);
    expect(
      registry.manifestCoverage.find((route) => route.pattern === '/editor-demo')
        ?.access,
    ).toContain('Public editor demonstration');
    for (const pattern of ['/chronicles', '/timeline']) {
      const chronicle = registry.manifestCoverage.find(
        (route) => route.pattern === pattern,
      );
      const canonical = registry.manifestCoverage.find(
        (route) => route.pattern === '/chronicles',
      );
      expect(canonical?.actions).toContain(
        'enumerate all readable summaries in offset pages of 100 before rendering',
      );
      expect(
        chronicle && 'limitations' in chronicle ? chronicle.limitations?.join(' ') : '',
      ).toContain('Authenticated live account/role-change journeys');
      expect(chronicle?.verification.status).not.toBe('verified');
    }
  });

  it('keeps a staff demo partial until current authority and real API checks are reviewed', () => {
    const parent = path.join(
      root,
      '.local/workspace-setup/frontend-completion-20261020/route-acceptance',
    );
    mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(path.join(parent, 'registry-gallery-test-'));
    const output = path.join(directory, 'registry.json');
    const source = path.join(directory, 'source.txt');
    const artifact = path.join(directory, 'receipt.txt');
    try {
      writeFileSync(source, 'staff gallery source\n');
      writeFileSync(artifact, 'responsive and visual checks only\n');
      generate(output);
      const initial = JSON.parse(readFileSync(output, 'utf8')) as typeof registry;
      const gallery = initial.manifestCoverage.find(
        (entry) => entry.pattern === '/gallery',
      );
      if (!gallery) throw new Error('Missing Gallery coverage');
      writeFileSync(
        output,
        JSON.stringify({
          ...initial,
          reviewedReceipts: [
            {
              id: 'test-reviewed-gallery-visuals',
              reviewedBy: 'independent-test-reviewer',
              reviewedAt: '2026-10-20T00:00:00.000Z',
              checks: ['Responsive and visual facets only; no authority/API claim'],
              source: {
                scope: 'Bound Gallery test source',
                files: {
                  [path.relative(root, source)]: digest(readFileSync(source, 'utf8')),
                },
              },
              artifacts: {
                [path.relative(root, artifact)]: digest(readFileSync(artifact, 'utf8')),
              },
              routes: {
                '/gallery': {
                  requirementsSha256: gallery.requirementsSha256,
                  covers: ['responsive', 'visual-review'],
                },
              },
            },
          ],
        }),
      );
      generate(output);
      const checked = JSON.parse(readFileSync(output, 'utf8')) as typeof registry;
      expect(
        checked.manifestCoverage.find((entry) => entry.pattern === '/gallery')
          ?.verification,
      ).toMatchObject({
        status: 'partial',
        remainingEvidence: ['authority', 'live-api'],
      });
      expect(generate(output, true)).toContain('95 manifest coverage entries');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retains reviewed partial receipts, invalidates changed source and requirements, and reproduces either state', () => {
    const parent = path.join(
      root,
      '.local/workspace-setup/frontend-completion-20261020/route-acceptance',
    );
    mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(path.join(parent, 'registry-test-'));
    const output = path.join(directory, 'registry.json');
    const source = path.join(directory, 'source.txt');
    const artifact = path.join(directory, 'receipt.txt');
    try {
      writeFileSync(source, 'checked source\n');
      writeFileSync(
        artifact,
        'independently checked fixture behavior; live roles remain\n',
      );
      generate(output);
      const initial = JSON.parse(readFileSync(output, 'utf8')) as typeof registry;
      const route = initial.manifestCoverage.find(
        (entry) => entry.pattern === '/search',
      );
      if (!route) throw new Error('Missing Search coverage');
      const receipt = {
        id: 'test-reviewed-search',
        reviewedBy: 'independent-test-reviewer',
        reviewedAt: '2026-10-20T00:00:00.000Z',
        checks: ['Actual fixture behavior; no live acceptance claimed'],
        source: {
          scope: 'Bound test source',
          files: {
            [path.relative(root, source)]: digest(readFileSync(source, 'utf8')),
          },
        },
        artifacts: {
          [path.relative(root, artifact)]: digest(readFileSync(artifact, 'utf8')),
        },
        routes: {
          '/search': { requirementsSha256: route.requirementsSha256, covers: [] },
        },
      };
      writeFileSync(
        output,
        JSON.stringify({ ...initial, reviewedReceipts: [receipt] }),
      );
      generate(output);
      const first = readFileSync(output, 'utf8');
      const current = JSON.parse(first) as typeof registry;
      expect(current.reviewedReceipts).toEqual([receipt]);
      expect(
        current.manifestCoverage.find((entry) => entry.pattern === '/search')
          ?.verification,
      ).toMatchObject({
        status: 'partial',
        receipts: [receipt.id],
        invalidatedReceipts: [],
      });
      expect(generate(output, true)).toContain('95 manifest coverage entries');
      generate(output);
      expect(readFileSync(output, 'utf8')).toBe(first);

      writeFileSync(source, 'source changed after review\n');
      generate(output);
      const invalid = JSON.parse(readFileSync(output, 'utf8')) as typeof registry;
      expect(invalid.reviewedReceipts).toEqual([receipt]);
      expect(
        invalid.manifestCoverage.find((entry) => entry.pattern === '/search')
          ?.verification,
      ).toMatchObject({
        status: 'pending',
        receipts: [],
        invalidatedReceipts: [
          { id: receipt.id, reasons: [`changed file: ${path.relative(root, source)}`] },
        ],
      });
      expect(generate(output, true)).toContain('95 manifest coverage entries');

      writeFileSync(source, 'checked source\n');
      writeFileSync(artifact, 'artifact changed after review\n');
      generate(output);
      const artifactChanged = JSON.parse(
        readFileSync(output, 'utf8'),
      ) as typeof registry;
      expect(
        artifactChanged.manifestCoverage.find((entry) => entry.pattern === '/search')
          ?.verification.invalidatedReceipts,
      ).toEqual([
        { id: receipt.id, reasons: [`changed file: ${path.relative(root, artifact)}`] },
      ]);
      writeFileSync(
        artifact,
        'independently checked fixture behavior; live roles remain\n',
      );
      receipt.routes['/search'].requirementsSha256 = '0'.repeat(64);
      writeFileSync(
        output,
        JSON.stringify({ ...invalid, reviewedReceipts: [receipt] }),
      );
      generate(output);
      const requirementsChanged = JSON.parse(
        readFileSync(output, 'utf8'),
      ) as typeof registry;
      expect(
        requirementsChanged.manifestCoverage.find(
          (entry) => entry.pattern === '/search',
        )?.verification.invalidatedReceipts,
      ).toEqual([{ id: receipt.id, reasons: ['route requirements changed'] }]);

      const complete = {
        ...receipt,
        runtime: {
          frontend: 'test-source-epoch',
          api: 'test-api-epoch',
          origin: 'http://127.0.0.1:5173',
        },
        routes: {
          '/search': {
            requirementsSha256: route.requirementsSha256,
            covers: route.requiredEvidence,
          },
        },
      };
      writeFileSync(
        output,
        JSON.stringify({ ...initial, reviewedReceipts: [complete] }),
      );
      generate(output);
      const fullyCovered = JSON.parse(readFileSync(output, 'utf8')) as typeof registry;
      expect(
        fullyCovered.manifestCoverage.find((entry) => entry.pattern === '/search')
          ?.verification,
      ).toMatchObject({
        status: 'verified',
        receipts: [receipt.id],
        remainingEvidence: [],
      });
      writeFileSync(
        output,
        JSON.stringify({
          ...initial,
          reviewedReceipts: [{ ...complete, runtime: undefined }],
        }),
      );
      expect(() => generate(output)).toThrow();
      writeFileSync(
        output,
        JSON.stringify({
          ...initial,
          reviewedReceipts: [{ ...receipt, source: undefined }],
        }),
      );
      expect(() => generate(output)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps the existing sampled walkthrough routes separate from complete coverage', () => {
    expect(registry.routes.slice(0, 8).map((route) => route.path)).toEqual([
      '/',
      '/quests',
      '/quests/qa-the-salt-stair',
      '/quests/qa-chalk-and-wheel',
      '/quests/qa-planks-up',
      '/quests/qa-red-stake-evening',
      '/characters/qa-bram-holt',
      '/characters/qa-nell-holt',
    ]);
    expect(
      registry.routes.some((route) => route.path === '/this-route-does-not-exist-qa'),
    ).toBe(true);
  });
});
