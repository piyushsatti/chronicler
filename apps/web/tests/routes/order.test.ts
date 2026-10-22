import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
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

  it('registers the canonical Codex reader once alongside its typed aliases', () => {
    const registered = routes.map((route) => route.path);
    expect(registered.filter((path) => path === '/codex/:slug')).toHaveLength(1);
    expect(matchRoutes(routes, '/codex/tree-of-light')?.at(-1)?.route.path).toBe(
      '/codex/:slug',
    );
    expect(matchRoutes(routes, '/codex/npc/tree-of-light')?.at(-1)?.route.path).toBe(
      '/codex/npc/:slug',
    );
  });

  it.each([
    ['/codex/new', '/codex/new'],
    ['/codex/entry-id/edit', '/codex/:id/edit'],
    ['/codex/Entities/new', '/codex/:category/new'],
    ['/codex/Entities/entry-id/edit', '/codex/:category/:id/edit'],
    ['/codex/npc/new', '/codex/:category/new'],
    ['/codex/artifact/new', '/codex/:category/new'],
  ])('keeps %s on the editor route %s', (path, expected) => {
    expect(matchRoutes(routes, path)?.at(-1)?.route.path).toBe(expected);
  });

  it('does not register unrelated removed paths', () => {
    const registered = routes.map((route) => route.path);
    expect(registered).not.toContain('/rules/:slug');
    expect(registered).not.toContain('/chronicles/:slug');
    expect(registered).not.toContain('/documents/:slug');
  });
});
