import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type {
  EditorRevisionsQuery,
  EditorUnpublishMutation,
  EditorAudienceMutation,
  EditorDeleteMutation,
  EditorRestoreMutation,
} from '../../../api/graphql.operations.gen.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { parseDocumentMutationResult } from './editorMutations.js';
import REVISIONS from './editorRevisions.graphql?raw';
import UNPUBLISH from './editorUnpublish.graphql?raw';
import AUDIENCE from './editorAudience.graphql?raw';
import DELETE from './editorDelete.graphql?raw';
import RESTORE from './editorRestore.graphql?raw';

const revisionPage = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string(),
      rev: z.number().int(),
      title: z.string(),
      body: z.string(),
      reason: z.string(),
      recordedAt: z.string(),
    }),
  ),
});
export type RevisionPage = z.infer<typeof revisionPage>;
export async function loadEditorRevisions(
  documentId: string,
  offset: number,
): Promise<RevisionPage> {
  try {
    const data = await graphqlRequest<EditorRevisionsQuery>(REVISIONS, {
      documentId,
      limit: 20,
      offset,
    });
    const parsed = revisionPage.safeParse(data.documentRevisions);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'editor:revisions');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'editor:revisions');
  }
}
export type LifecycleAction =
  | { action: 'unpublish' }
  | { action: 'delete' }
  | { action: 'restore' }
  | {
      action: 'audience';
      visibility: string;
      policy?: string[] | null;
      readerIds: string[];
    };
export async function changeDocumentLifecycle(
  id: string,
  expectedRevision: number,
  command: LifecycleAction,
  idempotencyKey?: string,
): Promise<void> {
  try {
    if (
      command.action === 'audience' &&
      !z
        .object({
          visibility: z.enum(['public', 'dm_only', 'restricted']),
          policy: z.array(z.string().min(1)).nullable().optional(),
          readerIds: z.array(z.string().uuid()),
        })
        .safeParse(command).success
    )
      throw safeAppError(
        'Check the audience and reader member IDs.',
        'editor:audience',
      );
    const variables = {
      id,
      expectedRevision,
      meta: { idempotencyKey: idempotencyKey ?? crypto.randomUUID() },
    };
    if (command.action === 'delete') {
      await graphqlRequest<EditorDeleteMutation>(DELETE, variables);
      return;
    }
    const result =
      command.action === 'restore'
        ? (await graphqlRequest<EditorRestoreMutation>(RESTORE, variables))
            .restoreDocument
        : command.action === 'unpublish'
          ? (await graphqlRequest<EditorUnpublishMutation>(UNPUBLISH, variables))
              .unpublishDocument
          : (
              await graphqlRequest<EditorAudienceMutation>(AUDIENCE, {
                ...variables,
                input: {
                  visibility: command.visibility,
                  ...(command.policy !== undefined ? { policy: command.policy } : {}),
                  readerIds: command.readerIds,
                },
              })
            ).setDocumentVisibility;
    if (!parseDocumentMutationResult(result).ok)
      throw safeAppError('Reload to check the saved document.', 'editor:lifecycle');
  } catch (error) {
    throw toAppError(error, 'editor:lifecycle');
  }
}
