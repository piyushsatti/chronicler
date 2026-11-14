import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodMap from '../../../tests/fixtures/wire/map/good.json';

export const graphql: FeatureGraphql = {
  MapContainment: ({ variables }) =>
    HttpResponse.json({
      data: {
        map:
          variables?.atlasCode === goodMap.atlasCode
            ? {
                id: goodMap.id,
                pointcrawlNodes: goodMap.pointcrawlNodes
                  .slice(
                    Number(variables?.offset ?? 0),
                    Number(variables?.offset ?? 0) + Number(variables?.limit ?? 200),
                  )
                  .map(({ submapId }) => ({ submapId })),
              }
            : null,
      },
    }),
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
