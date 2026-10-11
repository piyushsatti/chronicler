import { z } from 'zod';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const questResultSchema = z.object({
  id: z.string(),
  shortCode: z.string().optional(),
});

const documentResultSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
});

export type EditorPublishResult = {
  id: string;
  redirectPath: string;
  warning?: string;
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
): AdapterResult<{ id: string; slug: string | null }> {
  const parsed = documentResultSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: { id: parsed.data.id, slug: parsed.data.slug ?? null },
  };
}

/** field-routing: createQuestV2 → POST /v1/quests */
export async function createQuest(
  input: QuestEditorInput,
): Promise<EditorPublishResult> {
  try {
    const wire = await restRequest<unknown>(rest.questCreate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = parseQuestMutationResult(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:create');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw toAppError(err, 'editor:quest:create');
  }
}

/** field-routing: updateQuestV2 → PATCH /v1/quests/{id} */
export async function updateQuest(
  questId: string,
  input: Partial<QuestEditorInput> & { title?: string; briefBody?: string },
): Promise<EditorPublishResult> {
  try {
    const wire = await restRequest<unknown>(rest.questUpdate(questId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = parseQuestMutationResult(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:quest:update');
    }
    const code = result.data.shortCode ?? result.data.id;
    return { id: result.data.id, redirectPath: `/quests/${code}` };
  } catch (err) {
    throw toAppError(err, 'editor:quest:update');
  }
}

/** field-routing: createDocument → POST /v1/documents */
export async function createDocument(
  input: DocumentEditorInput,
): Promise<EditorPublishResult> {
  try {
    const wire = await restRequest<unknown>(rest.documents, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = parseDocumentMutationResult(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:create');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:create');
  }
}

/** field-routing: updateDocument → PATCH /v1/documents/{id} */
export async function updateDocument(
  documentId: string,
  input: Partial<DocumentEditorInput>,
): Promise<EditorPublishResult> {
  try {
    const wire = await restRequest<unknown>(rest.documentUpdate(documentId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = parseDocumentMutationResult(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:update');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:update');
  }
}

/** field-routing: publishDocument → POST /v1/documents/{id}/publish */
export async function publishDocument(documentId: string): Promise<void> {
  try {
    await restRequest(rest.documentPublish(documentId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
  } catch (err) {
    throw toAppError(err, 'editor:document:publish');
  }
}

const previewSchema = z.union([
  z.object({ body: z.string() }),
  z.object({ preview: z.string() }),
]);

export function parseEditorPreview(wire: unknown): AdapterResult<string> {
  const parsed = previewSchema.safeParse(wire);
  if (!parsed.success)
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  return {
    ok: true,
    data: 'body' in parsed.data ? parsed.data.body : parsed.data.preview,
  };
}

/** field-routing: previewBody → POST /v1/documents/preview-body */
export async function previewBodyAs(input: {
  body: string;
  audience: string;
}): Promise<string> {
  try {
    const wire = await restRequest<unknown>(rest.documentPreviewBody, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = parseEditorPreview(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'editor:preview');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:preview');
  }
}

/**
 * field-routing: editPublishedDocument → PATCH /v1/documents/{id}/published
 * Atomic title/body edit for already-published briefs (legacy #280).
 */
export async function editPublishedDocument(input: {
  documentId: string;
  title: string;
  body: string;
}): Promise<EditorPublishResult> {
  try {
    const wire = await restRequest<unknown>(
      rest.documentEditPublished(input.documentId),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          title: input.title,
          body: input.body,
        }),
      },
    );
    const result = parseDocumentMutationResult(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:document:edit-published');
    }
    return {
      id: result.data.id,
      redirectPath: result.data.slug ? `/summaries/${result.data.slug}` : '/',
    };
  } catch (err) {
    throw toAppError(err, 'editor:document:edit-published');
  }
}

/** field-routing: discordDeliveryMode → GET /v1/config/discord-delivery-mode */
export async function usesDurableDiscordDelivery(): Promise<boolean> {
  try {
    const wire = await restRequest<{ discordDeliveryMode?: string; mode?: string }>(
      rest.discordDeliveryMode,
    );
    const mode = wire.discordDeliveryMode ?? wire.mode;
    return mode === 'queue';
  } catch {
    return false;
  }
}

/**
 * field-routing: syncQuestDiscordV2 → POST /v1/quests/{id}/discord/sync
 * Direct-mode bridge after quest save; skipped when delivery mode is `queue`.
 */
export async function syncQuestDiscord(questId: string): Promise<string | undefined> {
  try {
    const wire = await restRequest<{
      warning?: string | null;
      message?: string | null;
      ok?: boolean;
    }>(rest.questDiscordSync(questId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    return wire.warning ?? wire.message ?? undefined;
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
