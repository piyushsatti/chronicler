import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { stubRoute } from '../../chrome/routeBuilders.js';
import goodMap from '../../../tests/fixtures/wire/map/good.json';
import goodMapView from '../../../tests/fixtures/wire/map/view-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  map: (atlasCode: string) => ['map', atlasCode] as const,
  mapView: (atlasCode: string) => ['mapView', atlasCode] as const,
  hexFeatures: (hexcode: string) => ['hexFeatures', hexcode] as const,
};

export const graphql: FeatureGraphql = {
  MapAtlas: () => HttpResponse.json({ data: { map: goodMap } }),
  MapView: () => HttpResponse.json({ data: { mapView: goodMapView } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/map',
    element: lazyElement(() =>
      import('./pages/MapPage.js').then((module) => ({ default: module.MapPage })),
    ),
  },
  stubRoute('/map/:atlasCode', 'World map — coming soon'),
  stubRoute('/regions/:slug', 'Region hub'),
];
