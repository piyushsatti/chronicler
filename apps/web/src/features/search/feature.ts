import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodSearch from '../../../tests/fixtures/wire/search/good.json';
import goodSearchKinds from '../../../tests/fixtures/wire/search/kinds-good.json';

const searchKinds = '/v1/search/kinds';

export const endpoints = {
  searchKinds,
} as const;

export const queryKeys = {
  search: (q: string, kinds: string) => ['search', q, kinds] as const,
  searchKinds: ['searchKinds'] as const,
};

export const graphql: FeatureGraphql = {
  Search: () => HttpResponse.json({ data: { search: goodSearch } }),
};

export const handlers: FeatureHandlers = [
  http.get(searchKinds, () => HttpResponse.json(goodSearchKinds)),
];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/search',
    element: lazyElement(() =>
      import('./pages/SearchPage.js').then((module) => ({ default: module.SearchPage })),
    ),
  },
];
