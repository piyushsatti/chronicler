import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  search: (q: string, kinds: string) => ['search', q, kinds] as const,
  searchKinds: ['searchKinds'] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/search',
    element: lazyElement(() =>
      import('./pages/SearchPage.js').then((module) => ({
        default: module.SearchPage,
      })),
    ),
  },
];
