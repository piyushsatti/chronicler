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
  body: string;
  recordId: string;
  documentId: string | null;
  redirectHint: string | null;
  /** True when the loaded brief/document is already published (use editPublishedDocument). */
  briefPublished: boolean;
  /** Quest optimistic concurrency token (`QuestEditInput.expectedUpdatedAt`). */
  updatedAt: string | null;
  /** Document optimistic concurrency token (`DocumentEditInput.expectedRevision`). */
  documentVersion: number | null;
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
  regions: z.array(z.string()).optional().default([]),
  updatedAt: z.string(),
  briefDocument: z
    .object({
      id: z.string(),
      slug: z.string().optional(),
      title: z.string(),
      status: z.string().optional(),
      version: z.number().int(),
      effectiveBody: z.string().nullable().optional(),
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
        durationHours: String(q.durationHours ?? 3),
        slotsMax: String(q.slotsMax ?? 4),
        scheduledAt: q.scheduledAt,
        kinds: q.kinds,
        genres: q.genres,
        tags: q.tags,
        apl: q.apl ?? null,
        signupType: q.signupType ?? null,
        regions: q.regions,
      },
      body: brief?.effectiveBody ?? '',
      recordId: q.id,
      documentId: brief?.id ?? null,
      redirectHint: q.shortCode,
      briefPublished: (brief?.status ?? '').toLowerCase() === 'published',
      updatedAt: q.updatedAt,
      documentVersion: brief?.version ?? null,
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
      },
      body: d.effectiveBody ?? '',
      recordId: d.id,
      documentId: d.id,
      redirectHint: d.slug,
      briefPublished: (d.status ?? '').toLowerCase() === 'published',
      updatedAt: null,
      documentVersion: d.version,
    },
  };
}

function emptyDraft(
  typeKey: EditorTypeKey,
  category?: string | null,
): EditorLoadResult {
  return {
    meta: {
      title: '',
      durationHours: '3',
      slotsMax: '4',
      scheduledAt: new Date().toISOString(),
      category: category ?? null,
      kind: typeKey === 'dm-table' ? 'dm_table' : typeKey,
    },
    body: '',
    recordId: 'new',
    documentId: null,
    redirectHint: null,
    briefPublished: false,
    updatedAt: null,
    documentVersion: null,
  };
}

export async function loadEditorRecord(input: {
  typeKey: EditorTypeKey;
  mode: 'new' | 'edit';
  code?: string;
  id?: string;
  slug?: string;
  category?: string;
}): Promise<EditorLoadResult> {
  if (input.mode === 'new' || input.typeKey === 'demo') {
    return emptyDraft(input.typeKey, input.category ?? null);
  }

  try {
    if (input.typeKey === 'quest') {
      const key = input.code ?? input.id;
      if (!key) throw toAppError({ failure: 'NotFound' }, 'editor:load');
      const looksUuid = key.includes('-') && key.length > 20;
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
    const data = looksUuid
      ? await graphqlRequest<EditorDocumentByIdQuery>(DOCUMENT_BY_ID, {
          id: key,
        })
      : await graphqlRequest<EditorDocumentBySlugQuery>(DOCUMENT_BY_SLUG, {
          slug: key,
        });
    const wire = looksUuid
      ? (data as EditorDocumentByIdQuery).documentById
      : (data as EditorDocumentBySlugQuery).document;
    if (wire == null) throw toAppError({ failure: 'NotFound' }, 'editor:load');
    const result = parseDocumentLoad(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:load');
  }
}
