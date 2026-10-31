import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AppError } from '../../../errors/types.js';
import { previewBodyAs } from '../adapters/editorMutations.js';
import type { PreviewViewer } from '../bodyAuditCopy.js';
import type { EditorPreview } from '../types.js';

type PreviewRequest = { source: string; viewer: PreviewViewer };

function sameRequest(
  request: PreviewRequest | undefined,
  body: string,
  viewer: PreviewViewer,
): boolean {
  if (!request || request.source !== body || request.viewer.kind !== viewer.kind)
    return false;
  return (
    request.viewer.kind !== 'member' ||
    (viewer.kind === 'member' && request.viewer.handle === viewer.handle)
  );
}

/** A refused member handle says what is wrong with it; anything else keeps the generic copy. */
function previewError(error: unknown, viewer: PreviewViewer): AppError {
  const appError = toAppError(error, 'editor:preview');
  const cause = appError.cause;
  if (viewer.kind === 'member' && cause instanceof TransportError) {
    if (cause.code === 'NOT_FOUND' || cause.status === 404)
      return safeAppError(
        `No active member has the handle @${viewer.handle}. Choose another member.`,
        'editor:preview:member',
        cause,
      );
    if (cause.code === 'INVALID')
      return safeAppError(
        `@${viewer.handle} can’t be previewed: a handle uses only letters, numbers, _ . and -.`,
        'editor:preview:member',
        cause,
      );
  }
  return appError;
}

/**
 * The server's preview of the draft body (`previewBody`) as one viewer reads
 * it: a player, a DM, or a chosen member. Choosing a viewer previews again.
 */
export function useEditorPreview(body: string): {
  preview: EditorPreview;
  onPreview: () => void;
  viewer: PreviewViewer;
  setViewer: (viewer: PreviewViewer) => void;
} {
  const [viewer, setViewerState] = useState<PreviewViewer>({ kind: 'player' });
  const mutation = useMutation({
    mutationFn: async (request: PreviewRequest) => ({
      ...request,
      body: await previewBodyAs({
        body: request.source,
        audience: request.viewer.kind === 'dm' ? 'DM' : 'PLAYER',
        ...(request.viewer.kind === 'member'
          ? { memberHandle: request.viewer.handle }
          : {}),
      }),
    }),
  });
  const onPreview = (): void => {
    mutation.mutate({ source: body, viewer });
  };
  const setViewer = (next: PreviewViewer): void => {
    setViewerState(next);
    mutation.mutate({ source: body, viewer: next });
  };
  const result = (preview: EditorPreview) => ({ preview, onPreview, viewer, setViewer });
  const current = sameRequest(mutation.variables, body, viewer);
  if (mutation.isError && current)
    return result({ status: 'error', error: previewError(mutation.error, viewer) });
  if (mutation.isPending && current) return result({ status: 'loading' });
  if (mutation.data && sameRequest(mutation.data, body, viewer))
    return result({ status: 'ready', body: mutation.data.body });
  return result({ status: 'idle' });
}
