import { z } from 'zod';
import type {
  MapDocumentsQuery,
  MapAtlasQuery,
  MapNodeLinksQuery,
  MapDirectoryQuery,
  MapAssignmentsQuery,
  MapRegionCountsQuery,
  MapRegionActivityQuery,
  MapDocumentQuery,
  MapLocationDocumentsQuery,
  MapCreateMutation,
  MapUpdateMutation,
  MapUpdateMutationVariables,
  MapCreateMutationVariables,
  MapSaveNodeMutation,
  MapSaveNodeMutationVariables,
  MapSaveEdgeMutation,
  MapSaveEdgeMutationVariables,
  MapLinkEntryMutation,
  MapLinkEntryMutationVariables,
  MapQuestTitlesQuery,
  MapUnlinkEntryMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError } from '../../../errors/types.js';
import ATLAS from './map.graphql?raw';
import LINKS from './mapNodeLinks.graphql?raw';
import DIRECTORY from './mapDirectory.graphql?raw';
import ASSIGNMENTS from './mapAssignments.graphql?raw';
import COUNTS from './mapRegionCounts.graphql?raw';
import ACTIVITY from './mapRegionActivity.graphql?raw';
import DOCUMENT from './mapDocument.graphql?raw';
import DOCUMENTS from './mapDocuments.graphql?raw';
import LOCATIONS from './mapLocationDocuments.graphql?raw';
import CREATE from './mapCreate.graphql?raw';
import UPDATE from './mapUpdate.graphql?raw';
import NODE from './mapSaveNode.graphql?raw';
import EDGE from './mapSaveEdge.graphql?raw';
import LINK from './mapLinkEntry.graphql?raw';
import UNLINK from './mapUnlinkEntry.graphql?raw';
import QUEST_TITLES from './mapQuestTitles.graphql?raw';

const id = z.string().uuid();
const mapSchema = z.object({
  id,
  canEdit: z.boolean(),
  name: z.string(),
  atlasCode: z.string(),
  family: z.string(),
  grid: z.string(),
  mapKind: z.string(),
  assetPath: z.string().nullable(),
  regionId: id.nullable(),
  createdAt: z.string(),
});
const entrySchema = z.object({
  mapId: id,
  nodeId: id,
  documentId: id,
  relation: z.string(),
  createdAt: z.string(),
  createdBy: id,
});
const nodeSchema = z.object({
  id,
  mapId: id,
  x: z.number().finite(),
  y: z.number().finite(),
  name: z.string(),
  submapId: id.nullable(),
  createdAt: z.string(),
  linkedEntries: z.array(entrySchema),
});
const edgeSchema = z.object({
  id,
  mapId: id,
  nodeA: id,
  nodeB: id,
  directed: z.boolean(),
  kind: z.string(),
  label: z.string().nullable(),
  documentId: id.nullable(),
});
const regionSchema = z.object({
  canCreateMap: z.boolean(),
  id,
  name: z.string(),
  kind: z.string(),
  charterDeadline: z.string().nullable(),
  documentId: id.nullable(),
  createdAt: z.string(),
});
const documentSchema = z.object({
  id,
  slug: z.string(),
  kind: z.string(),
  category: z.string().nullable(),
  title: z.string(),
  effectiveBody: z.string().nullable(),
});
const assignmentSchema = z.object({
  memberId: id,
  regionId: id,
  grantedAt: z.string(),
});
const countsSchema = z.object({
  regionId: id,
  questCount: z.number(),
  pointcrawlNodeCount: z.number(),
});
const questRef = z.object({
  shortCode: z.string(),
  scheduledAt: z.string(),
  slotsMax: z.number(),
  filledCount: z.number(),
});
const activitySchema = z.object({
  regionId: id,
  regionName: z.string(),
  fillingCount: z.number(),
  scheduledCount: z.number(),
  liveCount: z.number(),
  openQuests: z.array(questRef),
  liveQuests: z.array(questRef),
});
export type MapAtlasView = z.infer<typeof mapSchema>;
export type MapNode = z.infer<typeof nodeSchema>;
export type MapEdge = z.infer<typeof edgeSchema>;
export type MapRegion = z.infer<typeof regionSchema>;
export type MapDocument = z.infer<typeof documentSchema>;
export type Pointcrawl = MapAtlasView & { nodes: MapNode[]; edges: MapEdge[] };
export type MapDirectory = { maps: MapAtlasView[]; regions: MapRegion[] };

function parse<T>(schema: z.ZodType<T>, wire: unknown): T {
  const parsed = schema.safeParse(wire);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'map:wire');
  return parsed.data;
}
export async function loadMap(atlasCode: string): Promise<Pointcrawl> {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  let metadata: MapAtlasView | undefined;
  for (let offset = 0; ; offset += 200) {
    const data = await graphqlRequest<MapAtlasQuery>(ATLAS, {
      atlasCode,
      limit: 200,
      offset,
    });
    if (!data.map) throw toAppError({ failure: 'NotFound' }, 'map:load');
    metadata = parse(mapSchema, data.map);
    const pageNodes = parse(z.array(nodeSchema), data.map.pointcrawlNodes);
    const pageEdges = parse(z.array(edgeSchema), data.map.pointcrawlEdges);
    nodes.push(...pageNodes);
    edges.push(...pageEdges);
    if (pageNodes.length < 200 && pageEdges.length < 200) break;
  }
  await Promise.all(
    nodes.map(async (node, nodeOffset) => {
      if (node.linkedEntries.length < 50) return;
      for (let offset = 50; ; offset += 50) {
        const data = await graphqlRequest<MapNodeLinksQuery>(LINKS, {
          atlasCode,
          nodeOffset,
          offset,
        });
        const row = data.map?.pointcrawlNodes[0];
        if (!row || row.id !== node.id)
          throw safeAppError(
            'The map changed while it was loading. Refresh to read its current locations.',
            'map:changed',
          );
        const page = parse(z.array(entrySchema), row.linkedEntries);
        node.linkedEntries.push(...page);
        if (page.length < 50) break;
      }
    }),
  );
  return { ...metadata, nodes, edges };
}
export async function loadMapDirectory(): Promise<MapDirectory> {
  const maps: MapAtlasView[] = [];
  const regions: MapRegion[] = [];
  for (let offset = 0; ; offset += 50) {
    const data = await graphqlRequest<MapDirectoryQuery>(DIRECTORY, {
      limit: 50,
      offset,
    });
    const pageMaps = parse(z.array(mapSchema), data.maps);
    const pageRegions = parse(z.array(regionSchema), data.regions);
    maps.push(...pageMaps);
    regions.push(...pageRegions);
    if (pageMaps.length < 50 && pageRegions.length < 50) break;
  }
  return { maps, regions };
}
export async function loadAssignments(filters: {
  memberId?: string;
  regionId?: string;
}) {
  const items: z.infer<typeof assignmentSchema>[] = [];
  for (let offset = 0; ; offset += 50) {
    const data = await graphqlRequest<MapAssignmentsQuery>(ASSIGNMENTS, {
      ...filters,
      offset,
    });
    const page = parse(
      z.object({ total: z.number(), items: z.array(assignmentSchema) }),
      data.archonAssignments,
    );
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) break;
  }
  return items;
}
export async function loadRegionCounts(regionId: string) {
  const data = await graphqlRequest<MapRegionCountsQuery>(COUNTS, { regionId });
  return data.regionCounts ? parse(countsSchema, data.regionCounts) : null;
}
export async function loadRegionActivity(atlasCode: string) {
  const data = await graphqlRequest<MapRegionActivityQuery>(ACTIVITY, { atlasCode });
  return data.regionActivity ? parse(activitySchema, data.regionActivity) : null;
}
const questTitleSchema = z.object({
  items: z.array(
    z.object({
      shortCode: z.string(),
      status: z.string(),
      displayStatus: z.string().nullable().optional(),
      briefDocument: z.object({ title: z.string() }).nullable().optional(),
    }),
  ),
});
export type RegionQuestTitle = { title: string | null; status: string };
/** The title query's page size (`mapQuestTitles.graphql`); larger regions are read in chunks. */
const QUEST_TITLE_PAGE = 50;
/** Brief titles and statuses for the quests a region lists by short code. */
export async function loadQuestTitles(
  codes: string[],
): Promise<Record<string, RegionQuestTitle>> {
  const chunks: string[][] = [];
  for (let start = 0; start < codes.length; start += QUEST_TITLE_PAGE)
    chunks.push(codes.slice(start, start + QUEST_TITLE_PAGE));
  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      const data = await graphqlRequest<MapQuestTitlesQuery>(QUEST_TITLES, {
        codes: chunk,
      });
      return parse(questTitleSchema, data.quests).items;
    }),
  );
  return Object.fromEntries(
    pages.flat().map((quest) => [
      quest.shortCode,
      {
        title: quest.briefDocument?.title ?? null,
        status: quest.displayStatus ?? quest.status,
      },
    ]),
  );
}
export async function loadMapDocument(documentId: string): Promise<MapDocument | null> {
  const data = await graphqlRequest<MapDocumentQuery>(DOCUMENT, { id: documentId });
  return data.documentById ? parse(documentSchema, data.documentById) : null;
}
export async function loadLocationDocuments(search: string, offset: number) {
  const data = await graphqlRequest<MapLocationDocumentsQuery>(LOCATIONS, {
    search: search || null,
    offset,
  });
  return parse(
    z.object({ total: z.number(), items: z.array(documentSchema) }),
    data.documents,
  );
}
export async function createMap(
  input: MapCreateMutationVariables['input'],
  idempotencyKey: string,
) {
  const data = await graphqlRequest<MapCreateMutation>(CREATE, {
    input,
    meta: { idempotencyKey },
  });
  return parse(z.object({ id, atlasCode: z.string() }), data.createMap);
}
export async function updateMap(
  mapId: string,
  input: MapUpdateMutationVariables['input'],
  idempotencyKey: string,
) {
  const data = await graphqlRequest<MapUpdateMutation>(UPDATE, {
    id: mapId,
    input,
    meta: { idempotencyKey },
  });
  return parse(z.object({ id, atlasCode: z.string() }), data.updateMap);
}
export async function saveNode(
  mapId: string,
  input: MapSaveNodeMutationVariables['input'],
  idempotencyKey: string,
) {
  const data = await graphqlRequest<MapSaveNodeMutation>(NODE, {
    mapId,
    input,
    meta: { idempotencyKey },
  });
  return parse(z.object({ id }), data.upsertPointcrawlNode);
}
export async function saveEdge(
  mapId: string,
  input: MapSaveEdgeMutationVariables['input'],
  idempotencyKey: string,
) {
  const data = await graphqlRequest<MapSaveEdgeMutation>(EDGE, {
    mapId,
    input,
    meta: { idempotencyKey },
  });
  return parse(z.object({ id }), data.setPointcrawlEdge);
}
export async function changeEntry(
  input: Omit<MapLinkEntryMutationVariables, 'meta'>,
  unlink: boolean,
  idempotencyKey: string,
) {
  await graphqlRequest<MapLinkEntryMutation | MapUnlinkEntryMutation>(
    unlink ? UNLINK : LINK,
    {
      ...input,
      meta: { idempotencyKey },
    },
  );
}

export async function loadMapDocuments(ids: string[]): Promise<(MapDocument | null)[]> {
  const first = ids[0];
  if (!first) return [];
  const data = await graphqlRequest<MapDocumentsQuery>(DOCUMENTS, {
    id0: first,
    id1: ids[1] ?? first,
    id2: ids[2] ?? first,
    id3: ids[3] ?? first,
    id4: ids[4] ?? first,
  });
  return [
    data.document0,
    data.document1,
    data.document2,
    data.document3,
    data.document4,
  ]
    .slice(0, ids.length)
    .map((value) => (value ? parse(documentSchema, value) : null));
}

export function mapWriteError(cause: unknown): string {
  if (cause instanceof TransportError && cause.code === 'CONFLICT')
    return 'The map or relationship changed. Refresh the map before trying again.';
  if (
    cause instanceof TransportError &&
    (cause.code === 'INVALID' || cause.code === 'INVALID_ARGUMENT')
  )
    return 'The server rejected this map reference or field. Check your selections and try again.';
  return toAppError(cause, 'map:write').userMessage;
}
