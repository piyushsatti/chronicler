import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;
export const queryKeys = {
  map: (atlasCode: string) => ['map', atlasCode] as const,
  mapContainment: (atlasCode: string) => ['mapContainment', atlasCode] as const,
  mapDirectory: ['mapDirectory'] as const,
  mapRegionAssignments: (regionId: string) =>
    ['mapRegionAssignments', regionId] as const,
  mapRegionCounts: (regionId: string) => ['mapRegionCounts', regionId] as const,
  mapRegionActivity: (atlasCode: string) => ['mapRegionActivity', atlasCode] as const,
  mapDocument: (id: string) => ['mapDocument', id] as const,
  mapDocuments: (ids: string[]) => ['mapDocuments', ...ids] as const,
  mapLocations: (search: string, offset: number) =>
    ['mapLocations', search, offset] as const,
  mapQuestTitles: (codes: string[]) => ['mapQuestTitles', ...codes] as const,
};

export const routes: readonly FeatureRoute[] = [
  ...['/map', '/map/:atlasCode'].map((path) => ({
    path,
    element: lazyElement(() =>
      import('./pages/MapPage.js').then((module) => ({ default: module.MapPage })),
    ),
  })),
  {
    path: '/regions',
    element: lazyElement(() =>
      import('./pages/RegionHubPage.js').then((module) => ({
        default: module.RegionsDirectoryPage,
      })),
    ),
  },
  {
    path: '/regions/:slug',
    element: lazyElement(() =>
      import('./pages/RegionHubPage.js').then((module) => ({
        default: module.RegionHubPage,
      })),
    ),
  },
];
