import { z } from 'zod';
import type {
  CreateDocumentMutation,
  CreateQuestMutation,
  DiscordDeliveryModeQuery,
  EditPublishedDocumentMutation,
  PreviewBodyQuery,
  PublishDocumentMutation,
  SyncQuestDiscordMutation,
  UpdateDocumentMutation,
  UpdateQuestMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import CREATE_QUEST from './createQuest.graphql?raw';
import UPDATE_QUEST from './updateQuest.graphql?raw';
import CREATE_DOCUMENT from './createDocument.graphql?raw';
import UPDATE_DOCUMENT from './updateDocument.graphql?raw';
import PUBLISH_DOCUMENT from './publishDocument.graphql?raw';
import EDIT_PUBLISHED from './editPublishedDocument.graphql?raw';
import PREVIEW_BODY from './previewBody.graphql?raw';
import DISCORD_DELIVERY_MODE from './discordDeliveryMode.graphql?raw';
import SYNC_QUEST_DISCORD from './syncQuestDiscord.graphql?raw';

function commandMeta(): { idempotencyKey: string } {
  return { idempotencyKey: crypto.randomUUID() };
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
};

export type DocumentEditorInput = {
  title: string;
  body: string;
  kind: string;
  category?: string | null;
  visibility?: string;
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
      },
      meta: commandMeta(),
    });
    const result = parseQuestMutationResult(data.createQuest);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:create');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw toAppError(err, 'editor:quest:create');
  }
}

/** field-routing: updateQuest → GraphQL Mutation.updateQuest */
export async function updateQuest(
  questId: string,
  input: Partial<QuestEditorInput> & { title?: string; briefBody?: string },
  expectedUpdatedAt: string,
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
      },
      meta: commandMeta(),
    });
    const result = parseQuestMutationResult(data.updateQuest);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:update');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw toAppError(err, 'editor:quest:update');
  }
}

/** field-routing: createDocument → GraphQL Mutation.createDocument */
export async function createDocument(
  input: DocumentEditorInput,
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<CreateDocumentMutation>(CREATE_DOCUMENT, {
      input: {
        kind: input.kind,
        category: input.category ?? null,
        title: input.title,
        body: input.body,
        frontmatter: {},
        visibility: input.visibility ?? 'public',
      },
      meta: commandMeta(),
    });
    const result = parseDocumentMutationResult(data.createDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:create');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
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
): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<UpdateDocumentMutation>(UPDATE_DOCUMENT, {
      id: documentId,
      input: {
        expectedRevision: input.expectedRevision,
        title: input.title,
        body: input.body,
        category: input.category ?? null,
      },
      meta: commandMeta(),
    });
    const result = parseDocumentMutationResult(data.updateDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:update');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
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
): Promise<void> {
  try {
    await graphqlRequest<PublishDocumentMutation>(PUBLISH_DOCUMENT, {
      id: documentId,
      expectedRevision,
      meta: commandMeta(),
    });
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
export async function editPublishedDocument(input: {
  documentId: string;
  title: string;
  body: string;
  expectedRevision: number;
}): Promise<EditorPublishResult> {
  try {
    const data = await graphqlRequest<EditPublishedDocumentMutation>(EDIT_PUBLISHED, {
      id: input.documentId,
      input: {
        expectedRevision: input.expectedRevision,
        title: input.title,
        body: input.body,
      },
      meta: commandMeta(),
    });
    const result = parseDocumentMutationResult(data.editPublishedDocument);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:edit-published');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
      version: result.data.version,
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:edit-published');
  }
}

/** field-routing: discordDeliveryMode → GraphQL Query.discordDeliveryMode */
export async function usesDurableDiscordDelivery(): Promise<boolean> {
  try {
    const data = await graphqlRequest<DiscordDeliveryModeQuery>(DISCORD_DELIVERY_MODE);
    return data.discordDeliveryMode === 'queue';
  } catch {
    return false;
  }
}

/**
 * field-routing: syncQuestDiscord → GraphQL Mutation.syncQuestDiscord
 * Direct-mode bridge after quest save; skipped when delivery mode is `queue`.
 */
export async function syncQuestDiscord(questId: string): Promise<string | undefined> {
  try {
    const data = await graphqlRequest<SyncQuestDiscordMutation>(SYNC_QUEST_DISCORD, {
      questId,
      meta: commandMeta(),
    });
    const status = data.syncQuestDiscord.deliveryStatus;
    if (status && status !== 'ok' && status !== 'applied' && status !== 'queued') {
      return data.syncQuestDiscord.deliveryStatus;
    }
    return undefined;
  } catch {
    return 'Quest saved; Discord synchronization could not be checked. Retry from the quest page.';
  }
}

/** Sync after save only when not on durable queue delivery. */
export async function maybeSyncQuestDiscord(
  questId: string,
): Promise<string | undefined> {
  if (await usesDurableDiscordDelivery()) return undefined;
  return syncQuestDiscord(questId);
}
