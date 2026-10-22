import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodCodex from '../../../tests/fixtures/wire/codex/good.json';
import goodCategories from '../../../tests/fixtures/wire/codex/categories-good.json';
import goodCodexEntry from '../../../tests/fixtures/wire/codex/entry-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  codexDirectory: (prefix: string) => ['codexDirectory', prefix] as const,
  codexEntry: (slug: string) => ['codexEntry', slug] as const,
};

export const graphql: FeatureGraphql = {
  CodexDirectory: ({ variables }) => {
    const prefix =
      typeof variables?.categoryPrefix === 'string' ? variables.categoryPrefix : '';
    const search =
      typeof variables?.search === 'string' ? variables.search.toLocaleLowerCase() : '';
    const limit = typeof variables?.limit === 'number' ? variables.limit : 50;
    const offset = typeof variables?.offset === 'number' ? variables.offset : 0;
    const matching = goodCodex.items.filter(
      (entry) =>
        (!prefix ||
          entry.category === prefix ||
          entry.category.startsWith(`${prefix}/`)) &&
        (!search || entry.title.toLocaleLowerCase().includes(search)),
    );
    return HttpResponse.json({
      data: {
        codexDirectory: {
          items: matching.slice(offset, offset + limit),
          total: matching.length,
        },
        codexCategories: goodCategories,
      },
    });
  },
  CodexEntry: ({ variables }) =>
    HttpResponse.json({
      data: {
        codexEntry:
          variables?.slug === goodCodexEntry.document.slug ? goodCodexEntry : null,
      },
    }),
  CodexEntryById: ({ variables }) =>
    HttpResponse.json({
      data: {
        documentById:
          variables?.id === goodCodexEntry.document.id
            ? {
                id: goodCodexEntry.document.id,
                slug: goodCodexEntry.document.slug,
                kind: goodCodexEntry.document.kind,
              }
            : null,
      },
    }),
};

export const handlers: FeatureHandlers = [];

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
