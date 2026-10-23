import { z } from 'zod';
import type {
  EntityLinkCodexDirectoryQuery,
  EntityLinkQuestBoardQuery,
  EntityLinkSearchQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { findCodexCategory } from '../../../utils/codexCategories.js';
import { personLabels } from '../../../utils/format.js';
import type { EntityLinkEntry, EntityLinkIndex } from '../types.js';
import BOARD_QUERY from './entityLinkQuestBoard.graphql?raw';
import CODEX_QUERY from './entityLinkCodexDirectory.graphql?raw';
import SEARCH_QUERY from './entityLinkSearch.graphql?raw';

const questItemSchema = z.object({
  id: z.string(),
  shortCode: z.string().nullable().optional(),
  briefDocument: z
    .object({
      title: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const codexItemSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  title: z.string(),
  category: z.string().nullable().optional(),
});

const searchDocSchema = z.object({
  id: z.string(),
  kind: z.string(),
  slug: z.string(),
  title: z.string(),
  questShortCode: z.string().nullable().optional(),
});

const searchMemberSchema = z.object({
  memberId: z.string(),
  handle: z.string(),
  displayName: z.string(),
});

export function parseEntityLinkIndex(wire: {
  quests?: unknown;
  codex?: unknown;
}): AdapterResult<EntityLinkIndex> {
  const quests = z.array(questItemSchema).safeParse(wire.quests ?? []);
  const codex = z.array(codexItemSchema).safeParse(wire.codex ?? []);
  if (!quests.success) {
    return { ok: false, failure: 'InvalidWire', detail: quests.error.message };
  }
  if (!codex.success) {
    return { ok: false, failure: 'InvalidWire', detail: codex.error.message };
  }
  const entries: EntityLinkEntry[] = [];
  for (const q of quests.data) {
    if (!q.shortCode) continue;
    entries.push({
      id: q.id,
      label: q.shortCode,
      kind: 'Quest',
      href: `/quests/${q.shortCode}`,
    });
  }
  const seenTitles = new Set<string>();
  for (const c of codex.data) {
    if (c.category && !findCodexCategory(c.category)) continue;
    if (seenTitles.has(c.title)) continue;
    seenTitles.add(c.title);
    entries.push({
      id: c.id,
      label: c.title,
      kind: 'Codex',
      href: c.slug ? `/codex/${c.slug}` : undefined,
    });
  }
  return { ok: true, data: entries };
}

/** Aggregate quest codes + codex titles for LiveEditor wikilink autocomplete. */
export async function loadEntityLinkIndex(): Promise<EntityLinkIndex> {
  try {
    const [questData, codexData] = await Promise.all([
      graphqlRequest<EntityLinkQuestBoardQuery>(BOARD_QUERY, {
        limit: 200,
      }),
      graphqlRequest<EntityLinkCodexDirectoryQuery>(CODEX_QUERY),
    ]);
    const result = parseEntityLinkIndex({
      quests: questData.questBoard?.items ?? [],
      codex: codexData.codexDirectory?.items ?? [],
    });
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:entity-index');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:entity-index');
  }
}

/** Live search feed for entity picker / wikilink typeahead (field-routing search). */
export async function searchEntityLinkFeed(
  query: string,
  limit = 12,
): Promise<EntityLinkIndex> {
  const q = query.trim();
  if (!q) return [];
  try {
    const data = await graphqlRequest<EntityLinkSearchQuery>(SEARCH_QUERY, {
      query: q,
      limit,
    });
    const docs = z.array(searchDocSchema).safeParse(data.search?.documents ?? []);
    const members = z.array(searchMemberSchema).safeParse(data.search?.members ?? []);
    if (!docs.success || !members.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'editor:entity-search');
    }
    const memberLabels = personLabels(members.data);
    const entries: EntityLinkEntry[] = [
      ...docs.data.map((d) => ({
        id: d.id,
        label: d.questShortCode ?? d.title,
        kind: d.kind,
        href: d.slug ? `/${d.kind}/${d.slug}` : undefined,
      })),
      ...members.data.map((m, index) => ({
        id: m.memberId,
        label: memberLabels[index],
        kind: 'Profile',
        href: `/players/@${m.handle}`,
      })),
    ];
    return entries;
  } catch (err) {
    throw toAppError(err, 'editor:entity-search');
  }
}
