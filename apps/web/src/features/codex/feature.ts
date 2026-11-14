import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  codexDirectory: (prefix: string) => ['codexDirectory', prefix] as const,
  codexEntry: (slug: string) => ['codexEntry', slug] as const,
};

function alias(path: string, by: 'slug' | 'id'): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./pages/CodexAliasPage.js').then((module) => ({
        default: by === 'id' ? module.CodexIdAliasPage : module.CodexSlugAliasPage,
      })),
    ),
  };
}

export const routes: readonly FeatureRoute[] = [
  {
    path: '/codex',
    element: lazyElement(() =>
      import('./pages/CodexPage.js').then((module) => ({ default: module.CodexPage })),
    ),
  },
  {
    path: '/codex/:slug',
    element: lazyElement(() =>
      import('./pages/CodexEntryPage.js').then((module) => ({
        default: module.CodexEntryPage,
      })),
    ),
  },
  alias('/codex/npc/:slug', 'slug'),
  alias('/codex/faction/:slug', 'slug'),
  alias('/codex/region/:slug', 'slug'),
  alias('/codex/location/:slug', 'slug'),
  alias('/codex/artifact/:id', 'id'),
  alias('/codex/event/:id', 'id'),
  alias('/codex/lore/:id', 'id'),
  {
    path: '/npcs',
    element: lazyElement(() =>
      import('./pages/NpcsDirectoryPage.js').then((module) => ({
        default: module.NpcsDirectoryPage,
      })),
    ),
  },
  alias('/npcs/:slug', 'slug'),
  {
    path: '/factions',
    element: lazyElement(() =>
      import('./pages/FactionsDirectoryPage.js').then((module) => ({
        default: module.FactionsDirectoryPage,
      })),
    ),
  },
  alias('/factions/:slug', 'slug'),
  // Straight to the Codex entry; /npcs/:slug and /factions/:slug are aliases of it.
  shortCodeRedirectRoute('/factions/:shortCode/redirect', '/codex'),
  shortCodeRedirectRoute('/npcs/:shortCode/redirect', '/codex'),
];
