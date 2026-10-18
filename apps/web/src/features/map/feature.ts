import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodMap from '../../../tests/fixtures/wire/map/good.json';

export const endpoints = {} as const;

export const queryKeys = {
  map: (atlasCode: string) => ['map', atlasCode] as const,
  hexFeatures: (hexcode: string) => ['hexFeatures', hexcode] as const,
};

export const graphql: FeatureGraphql = {
  MapAtlas: () => HttpResponse.json({ data: { map: goodMap } }),
};

export const handlers: FeatureHandlers = [];

/** Legacy router: /map is Coming Soon (product map not shipped). */
function mapComingSoon(path: string): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./pages/MapComingSoonPage.js').then((module) => ({
        default: module.MapComingSoonPage,
      })),
    ),
  };
}

export const routes: readonly FeatureRoute[] = [
  mapComingSoon('/map'),
  mapComingSoon('/map/:atlasCode'),
  {
    path: '/regions/:slug',
    element: lazyElement(() =>
      import('./pages/RegionHubPage.js').then((module) => ({
        default: module.RegionHubPage,
      })),
    ),
  },
];
