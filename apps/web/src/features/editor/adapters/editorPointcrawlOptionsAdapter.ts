import { z } from 'zod';
import type {
  EditorMapOptionsQuery,
  EditorMapPlacesQuery,
  EditorSetQuestPlacesMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import MAPS from './editorMapOptions.graphql?raw';
import PLACES from './editorMapPlaces.graphql?raw';
import SET_PLACES from './editorSetQuestPlaces.graphql?raw';

const named = z.object({ id: z.string().uuid(), name: z.string() });
const mapSchema = named.extend({ atlasCode: z.string(), canEdit: z.boolean() });
export type EditorMapOption = z.infer<typeof mapSchema>;
export type EditorMapPlace = z.infer<typeof named>;
export type EditorPlaceLink = { pointcrawlNodeId: string; role: 'expected' | 'visited' };

function wireError(error: unknown, source: string) {
  return toAppError(error instanceof z.ZodError ? { failure: 'InvalidWire' } : error, source);
}

/** field-routing: maps → GraphQL Query.maps. The pointcrawl maps a new quest may
 * point at, the same list the quest page offers. */
export async function loadEditorMapOptions(): Promise<EditorMapOption[]> {
  try {
    const items: EditorMapOption[] = [];
    for (;;) {
      const wire = await graphqlRequest<EditorMapOptionsQuery>(MAPS, {
        offset: items.length,
      });
      const page = z.array(mapSchema).parse(wire.maps);
      items.push(...page);
      if (page.length < 50) return items;
    }
  } catch (error) {
    throw wireError(error, 'editor:maps');
  }
}

/** field-routing: map.pointcrawlNodes → GraphQL Query.map. Every place on one map,
 * for the new quest's searchable place picker. */
export async function loadEditorMapPlaces(
  atlasCode: string,
): Promise<{ canEdit: boolean; nodes: EditorMapPlace[] }> {
  try {
    const nodes: EditorMapPlace[] = [];
    for (;;) {
      const wire = await graphqlRequest<EditorMapPlacesQuery>(PLACES, {
        atlasCode,
        offset: nodes.length,
      });
      if (!wire.map) throw toAppError({ failure: 'NotFound' }, 'editor:map-places');
      const page = z
        .object({ canEdit: z.boolean(), pointcrawlNodes: z.array(named) })
        .parse(wire.map);
      nodes.push(...page.pointcrawlNodes);
      if (page.pointcrawlNodes.length < 100) return { nodes, canEdit: page.canEdit };
    }
  } catch (error) {
    throw wireError(error, 'editor:map-places');
  }
}

/**
 * Saves a just-created quest's expected destinations. Quest creation does not take
 * map places, so this runs as a second command, the same mutation the quest page uses.
 */
export async function saveNewQuestPlaces(
  questId: string,
  links: EditorPlaceLink[],
  idempotencyKey: string,
): Promise<void> {
  try {
    const data = await graphqlRequest<EditorSetQuestPlacesMutation>(SET_PLACES, {
      questId,
      links,
      meta: { idempotencyKey },
    });
    z.array(z.object({ pointcrawlNodeId: z.string().uuid(), role: z.string() })).parse(
      data.setQuestPointcrawlLinks,
    );
  } catch (error) {
    throw wireError(error, 'editor:quest-places');
  }
}
