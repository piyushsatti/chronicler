import { createElement } from 'react';
import type { FeatureRoute } from '../../chrome/featureModule.js';
import type { EditorRouteProps } from './types.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  record: (
    input: EditorRouteProps & {
      code?: string;
      id?: string;
      slug?: string;
      category?: string;
      questId?: string;
      characterId?: string;
      timeZone?: string;
      seriesId?: string;
    },
  ) => ['editor', 'record', input] as const,
  regions: ['editor', 'regions'] as const,
  genres: ['editor', 'questGenreOptions'] as const,
  guideGroups: ['editor', 'guideGroups'] as const,
  seriesOptions: ['editor', 'seriesOptions'] as const,
  voiceChannels: ['editor', 'voiceChannels'] as const,
  entityLinkIndex: ['editor', 'entityLinkIndex'] as const,
} as const;

function editorRoute(
  path: string,
  typeKey: 'quest' | 'codex' | 'summary' | 'guide' | 'ruling' | 'dm-table' | 'hall-of-fame',
  mode: 'new' | 'edit',
): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./EditorRoute.js').then((module) => ({
        default: () => createElement(module.EditorRoute, { typeKey, mode }),
      })),
    ),
  };
}

export const routes: readonly FeatureRoute[] = [
  {
    path: '/editor-demo',
    element: lazyElement(() =>
      import('./EditorRoute.js').then((module) => ({ default: module.EditorDemoPage })),
    ),
  },
  redirectRoute('/_demo', '/editor-demo'),
  editorRoute('/quests/new', 'quest', 'new'),
  editorRoute('/quests/:code/edit', 'quest', 'edit'),
  editorRoute('/codex/new', 'codex', 'new'),
  editorRoute('/codex/:id/edit', 'codex', 'edit'),
  editorRoute('/codex/:category/new', 'codex', 'new'),
  editorRoute('/codex/:category/:id/edit', 'codex', 'edit'),
  editorRoute('/summaries/new', 'summary', 'new'),
  editorRoute('/summaries/:id/edit', 'summary', 'edit'),
  editorRoute('/rules/guides/new', 'guide', 'new'),
  editorRoute('/rules/guides/:id/edit', 'guide', 'edit'),
  editorRoute('/rules/rulings/new', 'ruling', 'new'),
  editorRoute('/rules/rulings/:id/edit', 'ruling', 'edit'),
  editorRoute('/editor/hall-of-fame', 'hall-of-fame', 'new'),
  editorRoute('/editor/hall-of-fame/:id/edit', 'hall-of-fame', 'edit'),
];
