import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { safeAppError } from '../../../errors/toAppError.js';
import { documentHref } from '../../../utils/documentHref.js';
import {
  createDocument,
  createQuest,
  editPublishedDocument,
  publishDocument,
  updateDocument,
  updateQuest,
  type EditorPublishResult,
} from '../adapters/editorMutations.js';
import {
  upsertEditorSummary,
  type SummaryRelations,
} from '../adapters/editorSummary.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import { schemaForType } from '../editorSchemas.js';
import { saveNewQuestPlaces } from '../adapters/editorPointcrawlOptionsAdapter.js';
import { FEATURE_CATEGORY, normalizeHexCode } from '../../../utils/hexCode.js';
import {
  parseQuestMetadata,
  parseSummaryRelations,
  schemaErrors,
} from '../editorValidation.js';
import type { EditorMeta, EditorMode, EditorTypeKey } from '../types.js';

const documentKinds = {
  codex: 'codex_entry',
  summary: 'summary',
  guide: 'rule',
  ruling: 'rule',
  'dm-table': 'community',
  demo: 'codex_entry',
} satisfies Record<Exclude<EditorTypeKey, 'quest'>, string>;

/** The quest description the API requires ("Quest brief required."); null when fine.
 *  Pass `body` only when the form can edit it. */
export function editorBodyError(typeKey: EditorTypeKey, body?: string): string | null {
  return typeKey === 'quest' && body !== undefined && body.trim() === ''
    ? 'Describe the quest for players'
    : null;
}

/** The form has a missing title, a field error or an empty quest description: show
 *  the field hints, never call the API. */
export function editorFormInvalid(
  typeKey: EditorTypeKey,
  mode: EditorMode,
  meta: EditorMeta,
  body?: string,
): boolean {
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  return (
    !title ||
    editorBodyError(typeKey, body) !== null ||
    Object.keys(schemaErrors(schemaForType(typeKey, meta, {}, mode), meta)).length > 0
  );
}

export function useEditorPublish({
  typeKey,
  mode,
  initial,
  meta,
  body,
  category,
  admit = () => true,
  scopeKey = initial.recordId,
  onInvalidTitle,
  onSuccess,
}: {
  typeKey: EditorTypeKey;
  mode: EditorMode;
  initial: EditorLoadResult;
  meta: EditorMeta;
  body: string;
  category?: string;
  admit?: () => boolean;
  scopeKey?: string;
  onInvalidTitle: () => void;
  onSuccess: (result: EditorPublishResult, publish?: boolean) => void;
}) {
  // Keep a successful create/update token if the subsequent publish fails.
  const persisted = useRef<{
    scopeKey: string;
    baseVersion: number | null;
    input: string;
    body: string | null;
    category: string | null;
    hex: string | null;
    summaryRelations: SummaryRelations | null;
    result: EditorPublishResult;
  } | null>(null);
  const writing = useRef(false);
  const currentAdmission = useRef({ admit, scopeKey });
  currentAdmission.current = { admit, scopeKey };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const replayKeys = useRef(new Map<string, string>());
  const replayKey = (operation: string, input: unknown) => {
    const fingerprint = JSON.stringify([operation, scopeKey, input]);
    let key = replayKeys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      replayKeys.current.set(fingerprint, key);
    }
    return key;
  };
  return useMutation({
    mutationFn: async (shouldPublish: boolean | undefined) => {
      if (writing.current)
        throw safeAppError('A save is already in progress.', 'editor:save');
      writing.current = true;
      try {
        if (
          currentAdmission.current.scopeKey !== scopeKey ||
          !currentAdmission.current.admit()
        )
          throw safeAppError(
            'Reload to check your current permissions and revision.',
            'editor:save',
          );
        const publish = shouldPublish !== false;
        const title = typeof meta.title === 'string' ? meta.title.trim() : '';
        // Callers check `editorFormInvalid` first, so this guard only catches a direct call.
        if (
          editorFormInvalid(typeKey, mode, meta, initial.canEditBody ? body : undefined)
        ) {
          onInvalidTitle();
          throw safeAppError(
            !title ? 'Title is required' : 'Check the highlighted properties.',
            'editor:save',
          );
        }
        if (!initial.canEditMetadata)
          throw safeAppError(
            'You cannot edit this record. Reload to check your current permissions.',
            'editor:save',
          );
        const bodyChanged =
          body !== initial.body && !(initial.body === null && body === '');
        if (bodyChanged && !initial.canEditBody)
          throw safeAppError(
            'The complete body is unavailable. Reload before replacing it.',
            'editor:save',
          );
        if (typeKey === 'quest') {
          const values = parseQuestMetadata(meta);
          if (!values.success)
            throw safeAppError('Check the highlighted properties.', 'editor:save');
          const v = values.data;
          const payload = {
            title,
            durationHours: v.durationHours,
            slotsMax: v.slotsMax,
            kinds: v.kinds,
            regionIds: v.regions,
            genres: v.genres,
            tags: v.tags,
            apl: typeof v.apl === 'number' ? v.apl : null,
            signupType: v.signupType,
            additionalInfo: v.additionalInfo ?? null,
          };
          let result: EditorPublishResult;
          if (mode === 'edit') {
            if (!initial.updatedAt)
              throw safeAppError(
                'Quest is missing an update token. Reload and try again.',
                'editor:save',
              );
            const input = {
              ...payload,
              ...(v.scheduledAt !== initial.meta.scheduledAt
                ? { scheduledAt: v.scheduledAt }
                : {}),
              ...(bodyChanged ? { briefBody: body } : {}),
            };
            result = await updateQuest(
              initial.recordId,
              input,
              initial.updatedAt,
              replayKey('quest-update', [input, initial.updatedAt]),
            );
          } else {
            const input = {
              ...payload,
              scheduledAt: v.scheduledAt,
              briefBody: body,
              ...(v.arcId ? { arcId: v.arcId } : {}),
            };
            result = await createQuest(input, replayKey('quest-create', input));
            const places = v.pointcrawlLinks ?? [];
            if (places.length > 0) {
              try {
                await saveNewQuestPlaces(
                  result.id,
                  places,
                  replayKey('quest-create-places', [result.id, places]),
                );
              } catch {
                // Saving again replays the same create, so it retries only the places.
                throw safeAppError(
                  'The quest was created, but its expected destinations were not saved. Save again to retry them.',
                  'editor:quest:places',
                );
              }
            }
          }
          return { ...result, originScope: scopeKey };
        }
        const kind = documentKinds[typeKey];
        const rawCategory =
          mode === 'edit'
            ? typeof meta.category === 'string'
              ? meta.category
              : typeof initial.meta.category === 'string'
                ? initial.meta.category
                : null
            : typeof meta.category === 'string'
              ? meta.category
              : (category ??
                (typeKey === 'guide' || typeKey === 'ruling'
                  ? typeKey
                  : typeKey === 'dm-table'
                    ? 'dm_table'
                    : null));
        // A guide's group is free text; blank files it under "General" as plain "guide".
        const docCategory =
          typeKey === 'guide' ? rawCategory?.trim() || 'guide' : rawCategory;
        // A Feature carries its map hex in frontmatter; other entries keep theirs untouched.
        const hex =
          typeKey === 'codex' && docCategory === FEATURE_CATEGORY
            ? normalizeHexCode(meta.hex)
            : null;
        const sourceSummary = typeKey === 'summary' ? initial.summary?.authoring : null;
        let summaryRelations: SummaryRelations | null = null;
        if (
          sourceSummary?.complete &&
          (sourceSummary.questIds.length > 0 ||
            (Array.isArray(meta.questIds) && meta.questIds.length > 0))
        ) {
          const parsed = parseSummaryRelations(meta);
          if (!parsed.success)
            throw safeAppError(
              'Choose at least one Quest and a valid character.',
              'editor:summary',
            );
          summaryRelations = parsed.data;
        }
        const inputSignature = JSON.stringify([
          title,
          body,
          kind,
          docCategory,
          summaryRelations,
          hex,
        ]);
        const previous =
          persisted.current?.scopeKey === scopeKey &&
          (initial.documentVersion === persisted.current.baseVersion ||
            initial.documentVersion === persisted.current.result.version)
            ? persisted.current
            : null;
        const documentId = previous?.result.id ?? initial.documentId;
        const version = previous?.result.version ?? initial.documentVersion;
        const acknowledgedBody = previous?.body ?? initial.body;
        const acknowledgedCategory = previous
          ? previous.category
          : typeof initial.meta.category === 'string'
            ? typeKey === 'guide'
              ? initial.meta.category.trim() || 'guide'
              : initial.meta.category
            : null;
        const previousHex = previous
          ? previous.hex
          : normalizeHexCode(initial.frontmatter.hex) || null;
        const acknowledgedBodyChanged =
          body !== acknowledgedBody && !(acknowledgedBody === null && body === '');
        const acknowledgedRelations =
          previous?.summaryRelations ??
          (sourceSummary
            ? {
                questIds: sourceSummary.questIds,
                characterId: sourceSummary.characterId,
              }
            : null);
        const relationsChanged =
          summaryRelations !== null &&
          JSON.stringify(summaryRelations) !== JSON.stringify(acknowledgedRelations);
        if (relationsChanged && !initial.canEditBody)
          throw safeAppError(
            'Reload with complete summary access before changing Quest links.',
            'editor:summary',
          );
        let saved: EditorPublishResult;
        if (previous?.input === inputSignature) {
          saved = previous.result;
        } else if (
          summaryRelations &&
          (!documentId || acknowledgedBodyChanged || relationsChanged)
        ) {
          if (!initial.canEditBody || (documentId && initial.body === null))
            throw safeAppError(
              'The complete summary is unavailable. Reload before replacing it.',
              'editor:summary',
            );
          if (documentId && version == null)
            throw safeAppError(
              'Summary is missing a revision. Reload and try again.',
              'editor:summary',
            );
          const input = {
            ...summaryRelations,
            ...(documentId && version !== null
              ? { documentId, expectedRevision: version }
              : {}),
            title,
            body,
            visibility: initial.visibility,
            frontmatter: initial.frontmatter,
          };
          saved = await upsertEditorSummary(
            input,
            replayKey('quest-summary-upsert', input),
          );
        } else if (documentId) {
          if (version == null)
            throw safeAppError(
              'Document is missing a revision. Reload and try again.',
              'editor:save',
            );
          const input = {
            title,
            kind,
            ...(docCategory !== acknowledgedCategory ? { category: docCategory } : {}),
            ...(hex !== null && hex !== previousHex
              ? { frontmatter: { ...initial.frontmatter, hex } }
              : {}),
            expectedRevision: version,
            ...(acknowledgedBodyChanged && initial.canEditBody ? { body } : {}),
          };
          saved = initial.briefPublished
            ? await editPublishedDocument(
                { ...input, documentId },
                replayKey('document-published-edit', [documentId, input]),
              )
            : await updateDocument(
                documentId,
                input,
                replayKey('document-update', [documentId, input]),
              );
        } else {
          const input = {
            title,
            body,
            kind,
            category: docCategory,
            visibility: 'public',
            ...(hex !== null ? { frontmatter: { hex } } : {}),
          };
          saved = await createDocument(input, replayKey('document-create', input));
        }
        persisted.current = {
          scopeKey,
          baseVersion: initial.documentVersion,
          input: inputSignature,
          body: initial.canEditBody ? body : null,
          category: docCategory,
          hex,
          summaryRelations,
          result: saved,
        };
        if (publish && !initial.briefPublished) {
          if (
            currentAdmission.current.scopeKey !== scopeKey ||
            !currentAdmission.current.admit()
          )
            throw safeAppError(
              'Your session or record changed. Reload before publishing the saved draft.',
              'editor:save',
            );
          if (saved.version == null)
            throw safeAppError(
              'Saved document is missing a revision. Reload and try again.',
              'editor:save',
            );
          const published = await publishDocument(
            saved.id,
            saved.version,
            replayKey('document-publish', [saved.id, saved.version]),
          );
          saved = { ...saved, ...published };
          persisted.current = {
            scopeKey,
            baseVersion: initial.documentVersion,
            input: inputSignature,
            body: initial.canEditBody ? body : null,
            category: docCategory,
            hex,
            summaryRelations,
            result: saved,
          };
        }
        return {
          ...saved,
          originScope: scopeKey,
          redirectPath:
            documentHref({
              kind,
              category: docCategory,
              slug: saved.slug ?? String(meta.slug ?? initial.redirectHint ?? ''),
            }) ?? saved.redirectPath,
        };
      } finally {
        writing.current = false;
      }
    },
    onSuccess: (result, publish) => {
      if (mounted.current && result.originScope === scopeKey && admit())
        onSuccess(result, publish !== false);
    },
  });
}
