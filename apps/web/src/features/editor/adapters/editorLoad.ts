import { z } from 'zod';
import type {
  EditorDocumentByIdQuery,
  EditorDocumentBySlugQuery,
  EditorQuestLoadQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import type { EditorTypeKey } from '../types.js';
import QUEST_LOAD from './editorQuestLoad.graphql?raw';
import DOCUMENT_BY_ID from './editorDocumentById.graphql?raw';
import DOCUMENT_BY_SLUG from './editorDocumentBySlug.graphql?raw';
import { loadSummaryQuest } from './editorSummary.js';
import { findCodexCategory } from '../../../utils/codexCategories.js';
import { defaultSessionStart } from '../editorDateTime.js';
import { isHexCode, normalizeHexCode } from '../../../utils/hexCode.js';

const summaryContextSchema = z.object({
  questId: z.string().uuid(),
  characterId: z.string().uuid().optional(),
});

export type EditorMeta = {
  title: string;
  durationHours?: string;
  slotsMax?: string;
  scheduledAt?: string;
  category?: string | null;
  kind?: string;
  [key: string]: unknown;
};

export type EditorLoadResult = {
  meta: EditorMeta;
  body: string | null;
  canEditBody: boolean;
  canEditMetadata: boolean;
  status: string;
  visibility: string;
  policy: string[] | null;
  readerIds: string[];
  authorId: string | null;
  frontmatter: Record<string, unknown>;
  recordId: string;
  documentId: string | null;
  redirectHint: string | null;
  /** True when the loaded brief/document is already published (use editPublishedDocument). */
  briefPublished: boolean;
  /** Quest optimistic concurrency token (`QuestEditInput.expectedUpdatedAt`). */
  updatedAt: string | null;
  /** Document optimistic concurrency token (`DocumentEditInput.expectedRevision`). */
  documentVersion: number | null;
  /** Quest loads only: the quest has no brief document the viewer can load, so there is nothing to edit. */
  briefMissing?: boolean;
  summary?: {
    authoring: {
      questIds: string[];
      characterId: string | null;
      complete: boolean;
    } | null;
    quests: { id: string; shortCode: string; title: string | null }[];
  };
};

const questLoadSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  scheduledAt: z.string(),
  durationHours: z.number(),
  slotsMax: z.number(),
  kinds: z.array(z.string()).optional().default(['standard']),
  genres: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  apl: z.number().nullable().optional(),
  signupType: z.string().nullable().optional(),
  voiceChannelId: z.string().nullable().optional(),
  regions: z.array(z.string()).optional().default([]),
  updatedAt: z.string(),
  arcId: z.string().nullable().optional(),
  arc: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  pointcrawlLinks: z
    .array(z.object({ pointcrawlNodeId: z.string(), role: z.enum(['expected', 'visited']) }))
    .optional()
    .default([]),
  briefDocument: z
    .object({
      id: z.string(),
      slug: z.string().optional(),
      title: z.string(),
      status: z.string().optional(),
      version: z.number().int(),
      effectiveBody: z.string().nullable().optional(),
      canEditBody: z.boolean().nullable().optional(),
      canEditMetadata: z.boolean().nullable().optional(),
      frontmatter: z.record(z.unknown()).optional().default({}),
    })
    .nullable()
    .optional(),
});

const documentLoadSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: z.string(),
  category: z.string().nullable().optional(),
  title: z.string(),
  status: z.string().optional(),
  version: z.number().int(),
  effectiveBody: z.string().nullable().optional(),
  canEditBody: z.boolean().nullable().optional(),
  canEditMetadata: z.boolean().nullable().optional(),
  visibility: z.string().optional().default('public'),
  policy: z.array(z.string()).nullable().optional(),
  readerIds: z.array(z.string()).nullable().optional(),
  authorId: z.string().optional(),
  frontmatter: z.record(z.unknown()).optional().default({}),
  summaryDerived: z
    .object({
      authoring: z
        .object({
          questIds: z.array(z.string().uuid()),
          characterId: z.string().uuid().nullable(),
          complete: z.boolean(),
        })
        .nullable(),
      quests: z.array(
        z.object({
          id: z.string().uuid(),
          shortCode: z.string(),
          title: z.string().nullable(),
        }),
      ),
    })
    .nullable()
    .optional(),
});

export function parseQuestLoad(wire: unknown): AdapterResult<EditorLoadResult> {
  const parsed = questLoadSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const q = parsed.data;
  const brief = q.briefDocument;
  return {
    ok: true,
    data: {
      meta: {
        title: brief?.title ?? q.shortCode,
        shortCode: q.shortCode,
        durationHours: String(q.durationHours),
        slotsMax: String(q.slotsMax),
        scheduledAt: q.scheduledAt,
        kinds: q.kinds,
        genres: q.genres,
        tags: q.tags,
        apl: q.apl ?? null,
        signupType: q.signupType ?? null,
        voiceChannelId: q.voiceChannelId ?? '',
        regions: q.regions,
        additionalInfo: brief?.frontmatter.additional_info ?? '',
        arcId: q.arcId ?? '',
        arc: q.arc ?? null,
        pointcrawlLinks: q.pointcrawlLinks,
      },
      body: brief?.effectiveBody ?? null,
      canEditMetadata: brief?.canEditMetadata === true,
      canEditBody:
        brief?.canEditBody === true && typeof brief.effectiveBody === 'string',
      status: brief?.status ?? 'draft',
      visibility: 'public',
      policy: [],
      readerIds: [],
      authorId: null,
      frontmatter: brief?.frontmatter ?? {},
      recordId: q.id,
      documentId: brief?.id ?? null,
      redirectHint: q.shortCode,
      briefPublished: (brief?.status ?? '').toLowerCase() === 'published',
      updatedAt: q.updatedAt,
      documentVersion: brief?.version ?? null,
      briefMissing: !brief,
    },
  };
}

export function parseDocumentLoad(wire: unknown): AdapterResult<EditorLoadResult> {
  const parsed = documentLoadSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const d = parsed.data;
  return {
    ok: true,
    data: {
      meta: {
        title: d.title,
        category: d.category ?? null,
        kind: d.kind,
        slug: d.slug,
        ...(typeof d.frontmatter.hex === 'string' ? { hex: d.frontmatter.hex } : {}),
        ...(d.kind === 'summary' && d.summaryDerived?.authoring
          ? {
              questIds: d.summaryDerived.authoring.questIds,
              characterId: d.summaryDerived.authoring.characterId,
            }
          : {}),
      },
      body: d.effectiveBody ?? null,
      canEditMetadata: d.canEditMetadata === true,
      canEditBody: d.canEditBody === true && typeof d.effectiveBody === 'string',
      status: d.status ?? 'draft',
      visibility: d.visibility,
      policy: d.policy ?? null,
      readerIds: d.readerIds ?? [],
      authorId: d.authorId ?? null,
      frontmatter: d.frontmatter,
      recordId: d.id,
      documentId: d.id,
      redirectHint: d.slug,
      briefPublished: (d.status ?? '').toLowerCase() === 'published',
      updatedAt: null,
      documentVersion: d.version,
      ...(d.kind === 'summary' && d.summaryDerived
        ? { summary: d.summaryDerived }
        : {}),
    },
  };
}

function emptyDraft(
  typeKey: EditorTypeKey,
  category?: string | null,
  context: { timeZone?: string; seriesId?: string; hex?: string } = {},
): EditorLoadResult {
  const initialCategory =
    typeKey === 'codex' ? (findCodexCategory(category) ?? category) : category;
  return {
    meta: {
      title: typeKey === 'hall-of-fame' ? 'Hall of Fame' : '',
      durationHours: '3',
      slotsMax: '4',
      scheduledAt: defaultSessionStart(new Date(), context.timeZone ?? 'UTC'),
      category:
        initialCategory ??
        (typeKey === 'guide'
          ? ''
          : typeKey === 'ruling'
            ? typeKey
            : typeKey === 'dm-table'
              ? 'dm_table'
              : typeKey === 'hall-of-fame'
                ? 'hall_of_fame'
                : null),
      kind:
        typeKey === 'codex'
          ? 'codex_entry'
          : typeKey === 'guide' || typeKey === 'ruling'
            ? 'rule'
            : typeKey === 'dm-table' || typeKey === 'hall-of-fame'
              ? 'community'
              : typeKey,
      ...(typeKey === 'summary' ? { questIds: [], characterId: null } : {}),
      kinds: ['standard'],
      ...(typeKey === 'quest' ? { arcId: context.seriesId ?? '' } : {}),
      ...(typeKey === 'codex' && context.hex ? { hex: context.hex } : {}),
      regions: [],
      genres: [],
      tags: [],
      signupType: 'dm_pick',
      ...(typeKey === 'quest' ? { voiceChannelId: '' } : {}),
    },
    body: '',
    canEditBody: true,
    canEditMetadata: true,
    status: 'draft',
    visibility: 'public',
    policy: [],
    readerIds: [],
    authorId: null,
    frontmatter: {},
    recordId: 'new',
    documentId: null,
    redirectHint: null,
    briefPublished: false,
    updatedAt: null,
    documentVersion: null,
    ...(typeKey === 'summary'
      ? {
          summary: {
            authoring: { questIds: [], characterId: null, complete: true },
            quests: [],
          },
        }
      : {}),
  };
}

export async function loadEditorRecord(input: {
  typeKey: EditorTypeKey;
  mode: 'new' | 'edit';
  code?: string;
  id?: string;
  slug?: string;
  category?: string;
  questId?: string;
  characterId?: string;
  /** New quests: the viewer's time zone for the default session time. */
  timeZone?: string;
  /** New quests: a series to pre-select (`/quests/new?series=<id>`). */
  seriesId?: string;
  /** New Codex Features: the map hex to pre-fill (`/codex/Feature/new?hex=LFR7008`). */
  hex?: string;
}): Promise<EditorLoadResult> {
  if (input.mode === 'new' || input.typeKey === 'demo') {
    const draft = emptyDraft(input.typeKey, input.category ?? null, {
      timeZone: input.timeZone,
      // Only a well-formed series id is pre-selected; anything else starts with no series.
      seriesId: z.string().uuid().safeParse(input.seriesId).data,
      // Only a well-formed hex number is pre-filled.
      hex: isHexCode(input.hex) ? normalizeHexCode(input.hex) : undefined,
    });
    if (input.typeKey === 'summary' && input.questId !== undefined) {
      const context = summaryContextSchema.safeParse(input);
      if (!context.success)
        throw toAppError({ failure: 'Invalid' }, 'editor:summary-context');
      const quest = await loadSummaryQuest(context.data.questId);
      return {
        ...draft,
        recordId: `new-summary:${quest.id}:${context.data.characterId ?? 'dm'}`,
        meta: {
          ...draft.meta,
          questIds: [quest.id],
          characterId: context.data.characterId ?? null,
        },
        summary: {
          authoring: {
            questIds: [quest.id],
            characterId: context.data.characterId ?? null,
            complete: true,
          },
          quests: [quest],
        },
      };
    }
    if (input.typeKey === 'summary' && input.characterId !== undefined)
      throw toAppError({ failure: 'Invalid' }, 'editor:summary-context');
    return draft;
  }

  try {
    if (input.typeKey === 'quest') {
      const key = input.code ?? input.id;
      if (!key) throw toAppError({ failure: 'NotFound' }, 'editor:load');
      const looksUuid = z.string().uuid().safeParse(key).success;
      const data = await graphqlRequest<EditorQuestLoadQuery>(QUEST_LOAD, {
        id: looksUuid ? key : null,
        shortCode: looksUuid ? null : key,
      });
      if (data.quest == null) throw toAppError({ failure: 'NotFound' }, 'editor:load');
      const result = parseQuestLoad(data.quest);
      if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:load');
      return result.data;
    }

    const key = input.id ?? input.slug ?? input.code;
    if (!key) throw toAppError({ failure: 'NotFound' }, 'editor:load');
    const looksUuid = /^[0-9a-f-]{36}$/i.test(key);
    const wire = looksUuid
      ? (
          await graphqlRequest<EditorDocumentByIdQuery>(DOCUMENT_BY_ID, {
            id: key,
          })
        ).documentById
      : (
          await graphqlRequest<EditorDocumentBySlugQuery>(DOCUMENT_BY_SLUG, {
            slug: key,
          })
        ).document;
    if (wire == null) throw toAppError({ failure: 'NotFound' }, 'editor:load');
    const result = parseDocumentLoad(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:load');
    const expectedKind =
      input.typeKey === 'codex'
        ? 'codex_entry'
        : input.typeKey === 'guide' || input.typeKey === 'ruling'
          ? 'rule'
          : input.typeKey === 'dm-table' || input.typeKey === 'hall-of-fame'
            ? 'community'
            : 'summary';
    const category =
      typeof result.data.meta.category === 'string'
        ? result.data.meta.category.toLowerCase()
        : '';
    if (
      result.data.meta.kind !== expectedKind ||
      (input.typeKey === 'dm-table' && category !== 'dm_table') ||
      (input.typeKey === 'hall-of-fame' && category !== 'hall_of_fame') ||
      (input.typeKey === 'ruling' && category !== 'ruling') ||
      (input.typeKey === 'guide' && category === 'ruling')
    )
      throw toAppError({ failure: 'NotFound' }, 'editor:kind');
    // A guide with no group is stored as "guide"; the form shows it as blank.
    if (input.typeKey === 'guide' && (category === 'guide' || category === 'guides'))
      return { ...result.data, meta: { ...result.data.meta, category: '' } };
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:load');
  }
}
