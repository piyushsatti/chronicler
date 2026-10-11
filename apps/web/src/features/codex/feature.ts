import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodCodex from '../../../tests/fixtures/wire/codex/good.json';
import goodCodexEntry from '../../../tests/fixtures/wire/codex/entry-good.json';
import type { CodexKind } from './pages/CodexTypedDetailPage.js';

export const endpoints = {} as const;

export const queryKeys = {
  codexDirectory: (prefix: string) => ['codexDirectory', prefix] as const,
  codexEntry: (slug: string) => ['codexEntry', slug] as const,
};

export const graphql: FeatureGraphql = {
  CodexDirectory: () => HttpResponse.json({ data: { codexDirectory: goodCodex } }),
  CodexEntry: () => HttpResponse.json({ data: { codexEntry: goodCodexEntry } }),
};

export const handlers: FeatureHandlers = [];

function typed(path: string, kind: CodexKind): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./pages/CodexTypedDetailPage.js').then((module) => ({
        default: () => module.CodexTypedDetailPage({ kind }),
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
  typed('/codex/npc/:slug', 'npc'),
  typed('/codex/faction/:slug', 'faction'),
  typed('/codex/region/:slug', 'region'),
  typed('/codex/location/:slug', 'location'),
  typed('/codex/artifact/:id', 'artifact'),
  typed('/codex/event/:id', 'event'),
  typed('/codex/lore/:id', 'lore'),
  {
    path: '/npcs',
    element: lazyElement(() =>
      import('./pages/NpcsDirectoryPage.js').then((module) => ({
        default: module.NpcsDirectoryPage,
      })),
    ),
  },
  typed('/npcs/:slug', 'npc'),
  {
    path: '/factions',
    element: lazyElement(() =>
      import('./pages/FactionsDirectoryPage.js').then((module) => ({
        default: module.FactionsDirectoryPage,
      })),
    ),
  },
  typed('/factions/:slug', 'faction'),
  {
    path: '/regions',
    element: lazyElement(() =>
      import('./pages/RegionsDirectoryPage.js').then((module) => ({
        default: module.RegionsDirectoryPage,
      })),
    ),
  },
  shortCodeRedirectRoute('/factions/:shortCode/redirect', '/factions'),
  shortCodeRedirectRoute('/npcs/:shortCode/redirect', '/npcs'),
];
