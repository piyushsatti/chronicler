import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  rulesHub: ['rulesHub'] as const,
  ruleDetail: (slug: string, family: 'guides' | 'rulings') =>
    ['ruleDetail', slug, family] as const,
};

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
      import('./pages/RuleDetailPage.js').then((module) => ({
        default: module.GuideDetailPage,
      })),
    ),
  },
  {
    path: '/rules/rulings/:id',
    element: lazyElement(() =>
      import('./pages/RuleDetailPage.js').then((module) => ({
        default: module.RulingDetailPage,
      })),
    ),
  },
];
