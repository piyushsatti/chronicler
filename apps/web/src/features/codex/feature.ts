import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute, stubRoute } from '../../chrome/routeBuilders.js';
import goodCodex from '../../../tests/fixtures/wire/codex/good.json';
import goodCodexEntry from '../../../tests/fixtures/wire/codex/entry-good.json';

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

export const routes: readonly FeatureRoute[] = [
  {
    path: '/codex',
    element: lazyElement(() =>
      import('./pages/CodexPage.js').then((module) => ({ default: module.CodexPage })),
    ),
  },
  stubRoute('/codex/npc/:slug', 'NPC detail'),
  stubRoute('/codex/faction/:slug', 'Faction detail'),
  stubRoute('/codex/region/:slug', 'Region hub (codex path)'),
  stubRoute('/codex/location/:slug', 'Location detail'),
  stubRoute('/codex/artifact/:id', 'Artifact detail'),
  stubRoute('/codex/event/:id', 'Event detail'),
  stubRoute('/codex/lore/:id', 'Lore detail'),
  {
    path: '/npcs',
    element: lazyElement(() =>
      import('./pages/NpcsDirectoryPage.js').then((module) => ({
        default: module.NpcsDirectoryPage,
      })),
    ),
  },
  stubRoute('/npcs/:slug', 'NPC detail (short path)'),
  {
    path: '/factions',
    element: lazyElement(() =>
      import('./pages/FactionsDirectoryPage.js').then((module) => ({
        default: module.FactionsDirectoryPage,
      })),
    ),
  },
  stubRoute('/factions/:slug', 'Faction detail (short path)'),
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
