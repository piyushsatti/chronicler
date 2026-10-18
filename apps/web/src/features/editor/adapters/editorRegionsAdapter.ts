import { z } from 'zod';
import type { EditorRegionsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import REGIONS_QUERY from './editorRegions.graphql?raw';

const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().optional(),
});

export type EditorRegionRow = {
  id: string;
  name: string;
};

export function parseEditorRegions(wire: unknown): AdapterResult<EditorRegionRow[]> {
  const parsed = z.array(regionSchema).safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.map((r) => ({ id: r.id, name: r.name })),
  };
}

/** Public regions list for editor RegionField / RegionMultiField. */
export async function loadEditorRegions(): Promise<EditorRegionRow[]> {
  try {
    const data = await graphqlRequest<EditorRegionsQuery>(REGIONS_QUERY, {
      kind: null,
    });
    const result = parseEditorRegions(data.regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:regions');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:regions');
  }
}
