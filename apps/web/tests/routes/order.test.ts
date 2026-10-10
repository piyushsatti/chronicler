import { describe, expect, it } from 'vitest';
import { routes } from '../../src/chrome/featureRegistry.js';
import { ROUTE_MANIFEST_PATHS } from '../../src/routes/routeManifest.js';

describe('route registry order', () => {
  it('registers every manifest path exactly once before the catch-all', () => {
    const registered = routes.map((route) => route.path);
    for (const path of ROUTE_MANIFEST_PATHS) {
      expect(registered, `missing manifest path ${path}`).toContain(path);
    }
    const manifestSet = new Set<string>(ROUTE_MANIFEST_PATHS);
    const manifestRoutes = registered.filter((path) => manifestSet.has(path));
    expect(manifestRoutes).toEqual([...ROUTE_MANIFEST_PATHS]);
  });

  it('does not register removed non-legacy paths', () => {
    const registered = routes.map((route) => route.path);
    expect(registered).not.toContain('/codex/:slug');
    expect(registered).not.toContain('/rules/:slug');
    expect(registered).not.toContain('/chronicles/:slug');
    expect(registered).not.toContain('/documents/:slug');
  });
});
