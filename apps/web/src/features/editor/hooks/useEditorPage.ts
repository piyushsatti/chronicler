import { useParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import type { EditorRouteProps } from '../types.js';
import { useEditorRecord } from './useEditorRecord.js';
import { useEditorWorkspace, type EditorWorkspaceView } from './useEditorWorkspace.js';

export type EditorPageData =
  | { status: 'error'; error: AppError }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; view: EditorWorkspaceView };

const PENDING: EditorLoadResult = {
  meta: { title: '' },
  body: '',
  recordId: '__pending',
  documentId: null,
  redirectHint: null,
  briefPublished: false,
};

export function useEditorPage({ typeKey, mode }: EditorRouteProps): EditorPageData {
  const params = useParams();
  const auth = useAuth();
  const enabled = typeKey === 'demo' || (auth.isAuthenticated && auth.sessionReady);
  const query = useEditorRecord(
    {
      typeKey,
      mode,
      code: params.code,
      id: params.id,
      slug: params.slug,
      category: params.category,
    },
    enabled,
  );
  const view = useEditorWorkspace({
    typeKey,
    mode,
    initial: query.data ?? PENDING,
    paramHint: params.code ?? params.id ?? params.slug,
    category: params.category,
    enabled: enabled && query.isSuccess,
  });
  if (query.isError)
    return { status: 'error', error: toAppError(query.error, 'editor:load') };
  if (query.isPending || !query.data) return { status: 'loading' };
  // A valid new draft is ready, even when its fields are blank. Missing edits remain AppError.
  return { status: 'ready', view };
}
