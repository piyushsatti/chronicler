import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  chronicleList: ['chronicleList'] as const,
  chronicleDetail: (id: string) => ['chronicleDetail', id] as const,
};

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
  {
    path: '/summaries/:slug',
    element: lazyElement(() =>
      import('./pages/SummaryDetailPage.js').then((module) => ({
        default: module.SummaryDetailPage,
      })),
    ),
  },
];
