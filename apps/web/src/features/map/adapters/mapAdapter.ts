import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import type { HexNode } from '../mapExploration.js';

const hexWireSchema = z.object({
  id: z.string().uuid(),
  hexcode: z.string().nullable().optional(),
  col: z.number().int(),
  row: z.number().int(),
  terrain: z.string(),
});

const mapWireSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  atlasCode: z.string(),
  hexes: z.array(hexWireSchema),
});

const placeWireSchema = z.object({
  hexId: z.string().uuid(),
  hexcode: z.string(),
  documentId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
});

const mapViewWireSchema = z.object({
  mapId: z.string().uuid(),
  name: z.string(),
  atlasCode: z.string(),
  places: z.array(placeWireSchema),
});

export type MapFeatureView = {
  id: string;
  title: string;
  summary: string;
  slug: string;
};

export type MapHexView = {
  id: string;
  hexcode: string;
  col: number;
  row: number;
  features: MapFeatureView[];
};

export type MapViewModel = {
  id: string;
  name: string;
  atlasCode: string;
  hexes: MapHexView[];
};

const MAP_QUERY = `
  query MapAtlas($atlasCode: String!) {
    map(atlasCode: $atlasCode) {
      id
      name
      atlasCode
      hexes(limit: 200) {
        id
        hexcode
        col
        row
        terrain
      }
    }
  }
`;

const MAP_VIEW_QUERY = `
  query MapView($atlasCode: String!) {
    mapView(atlasCode: $atlasCode, limit: 250) {
      mapId
      name
      atlasCode
      places {
        hexId
        hexcode
        documentId
        slug
        title
        category
      }
    }
  }
`;

export function parseMapBundle(
  mapWire: unknown,
  viewWire: unknown,
): AdapterResult<MapViewModel> {
  const map = mapWireSchema.safeParse(mapWire);
  if (!map.success) {
    return { ok: false, failure: 'InvalidWire', detail: map.error.message };
  }
  const view = mapViewWireSchema.safeParse(viewWire);
  if (!view.success) {
    return { ok: false, failure: 'InvalidWire', detail: view.error.message };
  }
  const featuresByHex = new Map<string, MapFeatureView[]>();
  for (const p of view.data.places) {
    if (p.category !== 'Feature') continue;
    const list = featuresByHex.get(p.hexcode) ?? [];
    list.push({
      id: p.documentId,
      title: p.title,
      summary: p.title,
      slug: p.slug,
    });
    featuresByHex.set(p.hexcode, list);
  }
  return {
    ok: true,
    data: {
      id: map.data.id,
      name: map.data.name,
      atlasCode: map.data.atlasCode,
      hexes: map.data.hexes.map((h) => {
        const hexcode = h.hexcode ?? `C${h.col}R${h.row}`;
        return {
          id: h.id,
          hexcode,
          col: h.col,
          row: h.row,
          features: featuresByHex.get(hexcode) ?? [],
        };
      }),
    },
  };
}

/** Derive HexNode ring/neighbors for the client exploration mock. */
export function hexesToNodes(hexes: MapHexView[]): HexNode[] {
  if (hexes.length === 0) return [];
  const center = hexes[0]!;
  return hexes.map((h) => {
    const dist =
      Math.abs(h.col - center.col) + Math.abs(h.row - center.row);
    const ring = h.hexcode === center.hexcode ? 0 : dist <= 1 ? 1 : 2;
    const neighbors = hexes
      .filter(
        (o) =>
          o.hexcode !== h.hexcode &&
          Math.abs(o.col - h.col) + Math.abs(o.row - h.row) <= 1,
      )
      .map((o) => o.hexcode);
    return { hexcode: h.hexcode, ring, neighbors };
  });
}

export async function loadMapBundle(atlasCode: string): Promise<MapViewModel> {
  try {
    const [mapData, viewData] = await Promise.all([
      graphqlRequest<{ map: unknown | null }>(MAP_QUERY, { atlasCode }),
      graphqlRequest<{ mapView: unknown }>(MAP_VIEW_QUERY, { atlasCode }),
    ]);
    if (mapData.map == null) {
      throw toAppError({ failure: 'NotFound' }, 'map:load');
    }
    const result = parseMapBundle(mapData.map, viewData.mapView);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'map:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'map:load');
  }
}

export const DEFAULT_ATLAS = 'LFC';
