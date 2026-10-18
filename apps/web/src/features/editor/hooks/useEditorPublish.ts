import { useMutation } from '@tanstack/react-query';
import { safeAppError } from '../../../errors/toAppError.js';
import {
  createDocument,
  createQuest,
  editPublishedDocument,
  maybeSyncQuestDiscord,
  publishDocument,
  updateDocument,
  updateQuest,
  type EditorPublishResult,
} from '../adapters/editorMutations.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import type { EditorMeta, EditorMode, EditorTypeKey } from '../types.js';

const DOCUMENT_KINDS: Partial<Record<EditorTypeKey, string>> = {
  codex: 'codex',
  summary: 'summary',
  guide: 'guide',
  ruling: 'ruling',
  'dm-table': 'dm_table',
};

export function useEditorPublish({
  typeKey,
  mode,
  initial,
  meta,
  body,
  category,
  onInvalidTitle,
  onSuccess,
}: {
  typeKey: EditorTypeKey;
  mode: EditorMode;
  initial: EditorLoadResult;
  meta: EditorMeta;
  body: string;
  category?: string;
  onInvalidTitle: () => void;
  onSuccess: (result: EditorPublishResult) => void;
}) {
  const publish = useMutation({
    mutationFn: async () => {
      const title = String(meta.title ?? '').trim();
      if (!title) {
        onInvalidTitle();
        throw safeAppError('Title is required', 'editor:publish');
      }

      if (typeKey === 'quest') {
        const payload = {
          title,
          briefBody: body,
          scheduledAt: String(meta.scheduledAt ?? new Date().toISOString()),
          durationHours: Number.parseFloat(String(meta.durationHours ?? '3')) || 3,
          slotsMax: Number.parseInt(String(meta.slotsMax ?? '4'), 10) || 4,
          kinds: (Array.isArray(meta.kinds) ? meta.kinds : ['standard']) as string[],
          regionIds: (Array.isArray(meta.regions) ? meta.regions : []) as string[],
          genres: (Array.isArray(meta.genres) ? meta.genres : []) as string[],
          tags: (Array.isArray(meta.tags) ? meta.tags : []) as string[],
          apl:
            typeof meta.apl === 'number'
              ? meta.apl
              : String(meta.apl ?? '').trim()
                ? Number.parseInt(String(meta.apl), 10)
                : null,
          signupType: typeof meta.signupType === 'string' ? meta.signupType : null,
        };
        let result;
        if (mode === 'edit' && initial.recordId !== 'new') {
          if (!initial.updatedAt) {
            throw safeAppError(
              'Quest is missing an update token. Reload and try again.',
              'editor:publish',
            );
          }
          result = await updateQuest(initial.recordId, payload, initial.updatedAt);
          if (initial.documentId && initial.briefPublished) {
            if (initial.documentVersion == null) {
              throw safeAppError(
                'Document is missing a revision. Reload and try again.',
                'editor:publish',
              );
            }
            await editPublishedDocument({
              documentId: initial.documentId,
              title,
              body: body.trim(),
              expectedRevision: initial.documentVersion,
            });
          } else if (initial.documentId) {
            if (initial.documentVersion == null) {
              throw safeAppError(
                'Document is missing a revision. Reload and try again.',
                'editor:publish',
              );
            }
            const updated = await updateDocument(initial.documentId, {
              title,
              body: body.trim(),
              expectedRevision: initial.documentVersion,
            });
            await publishDocument(updated.id, updated.version ?? initial.documentVersion);
          }
        } else {
          result = await createQuest(payload);
        }
        const warning = await maybeSyncQuestDiscord(result.id);
        return { ...result, warning };
      }

      const kind = DOCUMENT_KINDS[typeKey] ?? String(meta.kind ?? typeKey);
      const docCategory =
        category ?? (meta.category as string | null | undefined) ?? null;
      if (mode === 'edit' && initial.documentId) {
        if (initial.documentVersion == null) {
          throw safeAppError(
            'Document is missing a revision. Reload and try again.',
            'editor:publish',
          );
        }
        if (initial.briefPublished) {
          return editPublishedDocument({
            documentId: initial.documentId,
            title,
            body: body.trim(),
            expectedRevision: initial.documentVersion,
          });
        }
        const updated = await updateDocument(initial.documentId, {
          title,
          body,
          kind,
          category: docCategory,
          expectedRevision: initial.documentVersion,
        });
        await publishDocument(updated.id, updated.version ?? initial.documentVersion);
        return updated;
      }
      const created = await createDocument({
        title,
        body,
        kind,
        category: docCategory,
        visibility: 'public',
      });
      if (created.version == null) {
        throw safeAppError(
          'Created document is missing a revision. Reload and try again.',
          'editor:publish',
        );
      }
      await publishDocument(created.id, created.version);
      return created;
    },
    onSuccess,
  });
  return publish;
}
