import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const routes: readonly FeatureRoute[] = [
  {
    path: '/players/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.PlayerProfilePage,
      })),
    ),
  },
  {
    path: '/dms/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DMProfilePage,
      })),
    ),
  },
];
