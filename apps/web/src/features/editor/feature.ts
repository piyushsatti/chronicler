import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { redirectRoute, stubRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  stubRoute('/editor-demo', 'Editor demo'),
  redirectRoute('/_demo', '/editor-demo'),
  stubRoute('/quests/new', 'Quest editor — new'),
  stubRoute('/quests/:code/edit', 'Quest editor — edit'),
  stubRoute('/codex/new', 'Codex editor — new'),
  stubRoute('/codex/:id/edit', 'Codex editor — edit'),
  stubRoute('/codex/:category/new', 'Codex editor — new category'),
  stubRoute('/codex/:category/:id/edit', 'Codex editor — edit category'),
  stubRoute('/summaries/new', 'Summary editor — new'),
  stubRoute('/summaries/:id/edit', 'Summary editor — edit'),
  stubRoute('/rules/guides/new', 'Guide editor — new'),
  stubRoute('/rules/guides/:id/edit', 'Guide editor — edit'),
  stubRoute('/rules/rulings/new', 'Ruling editor — new'),
  stubRoute('/rules/rulings/:id/edit', 'Ruling editor — edit'),
  stubRoute('/editor/dm-table', 'DM table editor gate'),
  stubRoute('/editor/dm-table/:id/edit', 'DM table editor — edit'),
];
