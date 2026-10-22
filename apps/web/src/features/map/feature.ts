import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodMap from '../../../tests/fixtures/wire/map/good.json';

export const endpoints = {} as const;
export const queryKeys = {
  map: (atlasCode: string) => ['map', atlasCode] as const,
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
export const graphql: FeatureGraphql = {
  MapAtlas: ({ variables }) =>
    HttpResponse.json({
      data: {
        map:
          variables?.atlasCode === goodMap.atlasCode
            ? {
                ...goodMap,
                pointcrawlNodes: goodMap.pointcrawlNodes.slice(
                  Number(variables?.offset ?? 0),
                  Number(variables?.offset ?? 0) + Number(variables?.limit ?? 200),
                ),
                pointcrawlEdges: goodMap.pointcrawlEdges.slice(
                  Number(variables?.offset ?? 0),
                  Number(variables?.offset ?? 0) + Number(variables?.limit ?? 200),
                ),
              }
            : null,
      },
    }),
  MapDirectory: () => HttpResponse.json({ data: { maps: [goodMap], regions: [] } }),
  MapAssignments: () =>
    HttpResponse.json({ data: { archonAssignments: { total: 0, items: [] } } }),
  MapDocument: () => HttpResponse.json({ data: { documentById: null } }),
  MapDocuments: () =>
    HttpResponse.json({
      data: {
        document0: null,
        document1: null,
        document2: null,
        document3: null,
        document4: null,
      },
    }),
  MapLocationDocuments: () =>
    HttpResponse.json({ data: { documents: { total: 0, items: [] } } }),
  MapRegionCounts: () => HttpResponse.json({ data: { regionCounts: null } }),
  MapRegionActivity: () => HttpResponse.json({ data: { regionActivity: null } }),
  MapQuestTitles: () => HttpResponse.json({ data: { quests: { items: [] } } }),
};
export const handlers: FeatureHandlers = [];
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
