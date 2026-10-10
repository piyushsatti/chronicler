import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { stubRoute } from '../../chrome/routeBuilders.js';
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
  stubRoute('/rules/guides/:id', 'Guide detail'),
  stubRoute('/rules/rulings/:id', 'Ruling detail'),
];
