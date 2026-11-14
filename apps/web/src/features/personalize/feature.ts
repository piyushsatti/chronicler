import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  personalization: ['personalization'] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/me/personalize',
    element: lazyElement(() =>
      import('./pages/PersonalizePage.js').then((module) => ({
        default: module.PersonalizePage,
      })),
    ),
  },
];
