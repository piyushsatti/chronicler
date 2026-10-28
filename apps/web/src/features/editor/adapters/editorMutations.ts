import { z } from 'zod';
import type {
  CreateDocumentMutation,
  CreateQuestMutation,
  EditPublishedDocumentMutation,
  PreviewBodyQuery,
  PublishDocumentMutation,
  UpdateDocumentMutation,
  UpdateQuestMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { QUEST_DM_APPROVAL_ERROR } from '../editorConstants.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AdapterResult, type AppError } from '../../../errors/types.js';
import { documentHref } from '../../../utils/documentHref.js';
import CREATE_QUEST from './createQuest.graphql?raw';
import UPDATE_QUEST from './updateQuest.graphql?raw';
import CREATE_DOCUMENT from './createDocument.graphql?raw';
import UPDATE_DOCUMENT from './updateDocument.graphql?raw';
import PUBLISH_DOCUMENT from './publishDocument.graphql?raw';
import EDIT_PUBLISHED from './editPublishedDocument.graphql?raw';
import PREVIEW_BODY from './previewBody.graphql?raw';

function commandMeta(idempotencyKey?: string): { idempotencyKey: string } {
  return { idempotencyKey: idempotencyKey ?? crypto.randomUUID() };
}

const questResultSchema = z.object({
  id: z.string(),
  shortCode: z.string().optional(),
  updatedAt: z.string().optional(),
});

const documentResultSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  version: z.number().int(),
});

export type EditorPublishResult = {
  id: string;
  redirectPath: string;
  warning?: string;
  version?: number;
  slug?: string;
};

export type QuestEditorInput = {
  title: string;
  briefBody: string;
  scheduledAt: string;
  durationHours: number;
  slotsMax: number;
  kinds: string[];
  regionIds: string[];
  genres: string[];
  tags: string[];
  apl: number | null;
  signupType: string | null;
  additionalInfo: string | null;
  /** Discord voice channel id from the admin list; null or '' means none. */
  voiceChannelId?: string | null;
  /** Series (quest arc) for the quest; null takes it out of its series. */
  arcId?: string | null;
};


/**
 * The reason the API gave for refusing a quest command, as user copy. Expected
 * refusals (an unapproved DM, a rejected field) say what to fix; anything else
 * keeps the generic message.
 */
export function questCommandError(err: unknown, context: string): AppError {
  if (err instanceof TransportError) {
    const message = err.serverMessage?.trim() ?? '';
    if (err.code === 'FORBIDDEN' && /DM must be active and approved/i.test(message))
      return safeAppError(
        'Your DM profile must be approved before you can post quests. Open your DM profile to submit it or check its review status.',
        QUEST_DM_APPROVAL_ERROR,
        err,
      );
    if (err.code === 'FORBIDDEN' && /only to a series you started/i.test(message))
      return safeAppError(
        'The quest was not saved: you can add a quest only to a series you started. Choose one of your series or No series.',
        context,
        err,
      );
    if (err.code === 'INVALID' && message)
      return safeAppError(
        `The quest was not saved: ${message.charAt(0).toUpperCase()}${message.slice(1)}.`,
        context,
        err,
      );
  }
  return toAppError(err, context);
}

export type DocumentEditorInput = {
  title: string;
  body: string;
  kind: string;
  category?: string | null;
  visibility?: string;
  /** Whole frontmatter object; an update replaces the stored one, so callers merge first. */
  frontmatter?: Record<string, unknown>;
};

export function parseQuestMutationResult(
  wire: unknown,
): AdapterResult<{ id: string; shortCode: string | null }> {
  const parsed = questResultSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: { id: parsed.data.id, shortCode: parsed.data.shortCode ?? null },
  };
}

export function parseDocumentMutationResult(
  wire: unknown,
): AdapterResult<{ id: string; slug: string | null; version: number }> {
  const parsed = documentResultSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug ?? null,
      version: parsed.data.version,
    },
  };
}

/** field-routing: createQuest → GraphQL Mutation.createQuest */
export async function createQuest(
  input: QuestEditorInput,
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<CreateQuestMutation>(CREATE_QUEST, {
      input: {
        title: input.title,
        briefBody: input.briefBody,
        scheduledAt: input.scheduledAt,
        durationHours: input.durationHours,
        slotsMax: input.slotsMax,
        kinds: input.kinds,
        regionIds: input.regionIds,
        genres: input.genres,
        tags: input.tags,
        apl: input.apl,
        signupType: input.signupType,
        additionalInfo: input.additionalInfo,
        voiceChannelId: input.voiceChannelId || null,
        ...(input.arcId ? { arcId: input.arcId } : {}),
      },
      meta: commandMeta(idempotencyKey),
    });
    const result = parseQuestMutationResult(data.createQuest);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:create');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw questCommandError(err, 'editor:quest:create');
  }
}

/** field-routing: updateQuest → GraphQL Mutation.updateQuest */
export async function updateQuest(
  questId: string,
  input: Partial<QuestEditorInput> & { title?: string; briefBody?: string },
  expectedUpdatedAt: string,
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<UpdateQuestMutation>(UPDATE_QUEST, {
      id: questId,
      input: {
        expectedUpdatedAt,
        title: input.title,
        briefBody: input.briefBody,
        scheduledAt: input.scheduledAt,
        durationHours: input.durationHours,
        slotsMax: input.slotsMax,
        kinds: input.kinds,
        regionIds: input.regionIds,
        genres: input.genres,
        tags: input.tags,
        apl: input.apl,
        signupType: input.signupType,
        additionalInfo: input.additionalInfo,
        ...(input.voiceChannelId !== undefined
          ? { voiceChannelId: input.voiceChannelId || null }
          : {}),
        ...(input.arcId !== undefined ? { arcId: input.arcId } : {}),
      },
      meta: commandMeta(idempotencyKey),
    });
    const result = parseQuestMutationResult(data.updateQuest);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:update');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw questCommandError(err, 'editor:quest:update');
  }
}

/** field-routing: createDocument → GraphQL Mutation.createDocument */
export async function createDocument(
  input: DocumentEditorInput,
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<CreateDocumentMutation>(CREATE_DOCUMENT, {
      input: {
        kind: input.kind,
        category: input.category ?? null,
        title: input.title,
        body: input.body,
        frontmatter: input.frontmatter ?? {},
        visibility: input.visibility ?? 'public',
      },
      meta: commandMeta(idempotencyKey),
    });
    const result = parseDocumentMutationResult(data.createDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:create');
    }
    return {
      id: result.data.id,
      redirectPath:
        documentHref({
          kind: input.kind,
          category: input.category,
          slug: result.data.slug ?? '',
        }) ?? '/',
      slug: result.data.slug ?? undefined,
      version: result.data.version,
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:create');
  }
}

/** field-routing: updateDocument → GraphQL Mutation.updateDocument */
export async function updateDocument(
  documentId: string,
  input: Partial<DocumentEditorInput> & { expectedRevision: number },
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<UpdateDocumentMutation>(UPDATE_DOCUMENT, {
      id: documentId,
      input: {
        expectedRevision: input.expectedRevision,
        title: input.title,
        body: input.body,
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.frontmatter !== undefined ? { frontmatter: input.frontmatter } : {}),
      },
      meta: commandMeta(idempotencyKey),
    });
    const result = parseDocumentMutationResult(data.updateDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:update');
    }
    return {
      id: result.data.id,
      redirectPath:
        documentHref({
          kind: input.kind ?? '',
          category: input.category,
          slug: result.data.slug ?? '',
        }) ?? '/',
      slug: result.data.slug ?? undefined,
      version: result.data.version,
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:update');
  }
}

/** field-routing: publishDocument → GraphQL Mutation.publishDocument */
export async function publishDocument(
  documentId: string,
  expectedRevision: number,
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<PublishDocumentMutation>(PUBLISH_DOCUMENT, {
      id: documentId,
      expectedRevision,
      meta: commandMeta(idempotencyKey),
    });
    const result = parseDocumentMutationResult(data.publishDocument);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'editor:document:publish');
    return {
      id: result.data.id,
      slug: result.data.slug ?? undefined,
      version: result.data.version,
      redirectPath: '/',
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:publish');
  }
}

const previewSchema = z.union([
  z.string(),
  z.object({ body: z.string() }),
  z.object({ preview: z.string() }),
]);

export function parseEditorPreview(wire: unknown): AdapterResult<string> {
  const parsed = previewSchema.safeParse(wire);
  if (!parsed.success)
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  if (typeof parsed.data === 'string') return { ok: true, data: parsed.data };
  return {
    ok: true,
    data: 'body' in parsed.data ? parsed.data.body : parsed.data.preview,
  };
}

function toPreviewAudience(audience: string): 'PLAYER' | 'DM' {
  const normalized = audience.trim().toUpperCase();
  if (normalized === 'DM') return 'DM';
  return 'PLAYER';
}

/** field-routing: previewBody → GraphQL Query.previewBody */
export async function previewBodyAs(input: {
  body: string;
  audience: string;
}): Promise<string> {
  try {
    const data = await graphqlRequest<PreviewBodyQuery>(PREVIEW_BODY, {
      body: input.body,
      audience: toPreviewAudience(input.audience),
      authorId: null,
    });
    const result = parseEditorPreview(data.previewBody);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:preview');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:preview');
  }
}

/**
 * field-routing: editPublishedDocument → GraphQL Mutation.editPublishedDocument
 * Atomic title/body edit for already-published briefs (legacy #280).
 */
export async function editPublishedDocument(
  input: {
    documentId: string;
    title?: string;
    body?: string;
    kind?: string;
    category?: string | null;
    frontmatter?: Record<string, unknown>;
    expectedRevision: number;
  },
  idempotencyKey?: string,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<EditPublishedDocumentMutation>(EDIT_PUBLISHED, {
      id: input.documentId,
      input: {
        expectedRevision: input.expectedRevision,
        title: input.title,
        body: input.body,
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.frontmatter !== undefined ? { frontmatter: input.frontmatter } : {}),
      },
      meta: commandMeta(idempotencyKey),
    });
    const result = parseDocumentMutationResult(data.editPublishedDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:edit-published');
    }
    return {
      id: result.data.id,
      redirectPath:
        documentHref({
          kind: input.kind ?? '',
          category: input.category,
          slug: result.data.slug ?? '',
        }) ?? '/',
      slug: result.data.slug ?? undefined,
      version: result.data.version,
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:edit-published');
  }
}
