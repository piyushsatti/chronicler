import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  homeLanes: ['homeLanes'] as const,
  siteStats: ['siteStats'] as const,
  homeRecentChronicles: (authenticated: boolean) =>
    ['homeRecentChronicles', authenticated] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/',
    element: lazyElement(() =>
      import('./pages/HomePage.js').then((module) => ({ default: module.HomePage })),
    ),
  },
];
