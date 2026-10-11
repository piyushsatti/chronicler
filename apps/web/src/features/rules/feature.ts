import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodRulesList from '../../../tests/fixtures/wire/rules/list-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  rulesHub: ['rulesHub'] as const,
  guideDetail: (id: string) => ['guideDetail', id] as const,
  rulingDetail: (id: string) => ['rulingDetail', id] as const,
};

export const graphql: FeatureGraphql = {
  RulesList: () => HttpResponse.json({ data: { documents: goodRulesList } }),
  RuleDetail: () =>
    HttpResponse.json({ data: { document: goodRulesList.items[0] } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/rules',
    element: lazyElement(() =>
      import('./pages/RulesPage.js').then((module) => ({ default: module.RulesPage })),
    ),
  },
  {
    path: '/rules/guides/:id',
    element: lazyElement(() =>
      import('./pages/GuideDetailPage.js').then((module) => ({
        default: module.GuideDetailPage,
      })),
    ),
  },
  {
    path: '/rules/rulings/:id',
    element: lazyElement(() =>
      import('./pages/GuideDetailPage.js').then((module) => ({
        default: module.RulingDetailPage,
      })),
    ),
  },
];
