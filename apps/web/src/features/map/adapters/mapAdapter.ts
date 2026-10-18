import { z } from 'zod';
import type { MapAtlasQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import MAP_ATLAS_QUERY from './map.graphql?raw';

const mapWireSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  atlasCode: z.string(),
  family: z.string(),
  mapKind: z.string(),
  assetPath: z.string().nullable().optional(),
  regionId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});

const featureWireSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string(),
  slug: z.string().min(1),
});

const featuresWireSchema = z.array(featureWireSchema).max(4);

export type MapFeatureView = {
  id: string;
  title: string;
  summary: string;
  slug: string;
};

export type MapAtlasView = {
  id: string;
  name: string;
  atlasCode: string;
  family: string;
  mapKind: string;
  assetPath: string | null;
  regionId: string | null;
  createdAt: string;
};

export function parseHexFeatures(wire: unknown): AdapterResult<MapFeatureView[]> {
  const parsed = featuresWireSchema.safeParse(wire);
  if (!parsed.success) {
    return {
      ok: false,
      failure: 'InvalidWire',
      detail:
        Array.isArray(wire) && wire.length > 4
          ? 'max-4-features'
          : parsed.error.message,
    };
  }
  return { ok: true, data: parsed.data };
}

export function parseMap(wire: unknown): AdapterResult<MapAtlasView> {
  const parsed = mapWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      name: parsed.data.name,
      atlasCode: parsed.data.atlasCode,
      family: parsed.data.family,
      mapKind: parsed.data.mapKind,
      assetPath: parsed.data.assetPath ?? null,
      regionId: parsed.data.regionId ?? null,
      createdAt: parsed.data.createdAt,
    },
  };
}

/** Pointcrawl map atlas read — Query.map. Hex-grid selections retired (C3). */
export async function loadMap(atlasCode: string): Promise<MapAtlasView> {
  try {
    const data = await graphqlRequest<MapAtlasQuery>(MAP_ATLAS_QUERY, { atlasCode });
    if (data.map == null) {
      throw toAppError({ failure: 'NotFound' }, 'map:load');
    }
    const result = parseMap(data.map);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'map:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'map:load');
  }
}

export const DEFAULT_ATLAS = 'LFC';
