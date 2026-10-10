import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute, stubRoute } from '../../chrome/routeBuilders.js';
import goodChronicleList from '../../../tests/fixtures/wire/chronicle/list-good.json';
import goodDocument from '../../../tests/fixtures/wire/document/good.json';

export const endpoints = {} as const;

export const queryKeys = {
  chronicleList: ['chronicleList'] as const,
  chronicleDetail: (id: string) => ['chronicleDetail', id] as const,
};

export const graphql: FeatureGraphql = {
  ChronicleList: () =>
    HttpResponse.json({ data: { documents: goodChronicleList } }),
  ChronicleDetail: () => HttpResponse.json({ data: { document: goodDocument } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/chronicles/:id',
    element: lazyElement(() =>
      import('./pages/ChronicleDetailPage.js').then((module) => ({
        default: module.ChronicleDetailPage,
      })),
    ),
  },
  {
    path: '/chronicles',
    element: lazyElement(() =>
      import('./pages/ChroniclesListPage.js').then((module) => ({
        default: module.ChroniclesListPage,
      })),
    ),
  },
  redirectRoute('/timeline', '/chronicles'),
  stubRoute('/summaries/:slug', 'Summary detail'),
];
