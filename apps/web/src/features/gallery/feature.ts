import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const routes: readonly FeatureRoute[] = [
  {
    path: '/gallery',
    element: lazyElement(() =>
      import('./pages/GalleryPage.js').then((module) => ({
        default: module.GalleryPage,
      })),
    ),
  },
];
