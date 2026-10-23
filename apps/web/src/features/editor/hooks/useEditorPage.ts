import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import {
  canCreateRecord,
  createNeedsLiveDm,
  type CreateActor,
} from '../../../auth/createRules.js';
import { hasRole, isAdmin } from '../../../auth/roles.js';
import { useLiveDm, type LiveDmState } from '../../../hooks/useLiveDm.js';
import { useMe } from '../../../hooks/useMe.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { editorTimeZone } from '../editorDateTime.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import type { EditorLoadResult } from '../adapters/editorLoad.js';
import type { EditorRouteProps, EditorTypeKey } from '../types.js';
import { useEditorRecord } from './useEditorRecord.js';
import { useEditorWorkspace, type EditorWorkspaceView } from './useEditorWorkspace.js';

export type EditorPageData =
  | {
      status: 'error';
      error: AppError;
      retry?: () => void;
      /** A missing DM table offers a fresh one only to accounts allowed to start one. */
      canCreateNew?: boolean;
    }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; view: EditorWorkspaceView };

const PENDING: EditorLoadResult = {
  meta: { title: '' },
  body: null,
  canEditBody: false,
  canEditMetadata: false,
  status: 'draft',
  visibility: 'public',
  policy: [],
  readerIds: [],
  authorId: null,
  frontmatter: {},
  recordId: '__pending',
  documentId: null,
  redirectHint: null,
  briefPublished: false,
  updatedAt: null,
  documentVersion: null,
};

/** Who may start a new record. The rule and its divergence from the API live in `canCreateRecord`. */
export function canCreate(
  typeKey: EditorTypeKey,
  actor: CreateActor | undefined,
): boolean {
  return canCreateRecord(typeKey, actor);
}

/**
 * Only gated types wait on the account; codex and demo drafts open at once.
 * A failed account read is checked before the review proof: without an account
 * the proof query never runs, so it would otherwise read as loading forever.
 */
function createAccessFor(
  typeKey: EditorTypeKey,
  mode: EditorRouteProps['mode'],
  reviewAccess: CreateAccess | undefined,
  account: ReturnType<typeof useMe>,
  liveDm: LiveDmState,
): CreateAccess {
  if (mode !== 'new' || canCreate(typeKey, undefined)) return { status: 'allowed' };
  const roles = account.data?.roles;
  const waitsOnLiveDm = roles !== undefined && createNeedsLiveDm(typeKey, roles);
  if (account.isError)
    return {
      status: 'error',
      error: toAppError(account.error, 'editor:account'),
      retry: () => void account.refetch(),
    };
  if (reviewAccess?.status === 'error') return reviewAccess;
  if (liveDm.status === 'error')
    return { status: 'error', error: liveDm.error, retry: liveDm.retry };
  if (reviewAccess) return reviewAccess;
  if (roles === undefined) return { status: 'loading' };
  if (!waitsOnLiveDm)
    return {
      status: canCreate(typeKey, { roles, liveDm: false }) ? 'allowed' : 'forbidden',
    };
  if (liveDm.status !== 'ready') return { status: 'loading' };
  return {
    status: canCreate(typeKey, { roles, liveDm: liveDm.liveDm })
      ? 'allowed'
      : 'forbidden',
  };
}

const LOCATIONS_ACCESS = { canAuthorLocations: true };
const NO_ACCESS = { canAuthorLocations: false };

/** Whether this account may start the record; rules editors pass the server's review proof. */
export type CreateAccess =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'forbidden' }
  | { status: 'error'; error: AppError; retry?: () => void };

export function useEditorPage(
  { typeKey, mode }: EditorRouteProps,
  reviewAccess?: CreateAccess,
): EditorPageData {
  const params = useParams();
  const [search] = useSearchParams();
  const auth = useAuth();
  const { timeZone } = useDateFormatter();
  const meQuery = useMe();
  const me = meQuery.data;
  const canAuthorLocations = isAdmin(me?.roles) || hasRole(me?.roles, 'archon');
  const enabled = typeKey === 'demo' || (auth.isAuthenticated && auth.sessionReady);
  const query = useEditorRecord(
    {
      typeKey,
      mode,
      code: params.code,
      id: params.id,
      slug: params.slug,
      category: params.category,
      ...(typeKey === 'summary' && mode === 'new'
        ? {
            questId: search.get('questId') ?? undefined,
            characterId: search.get('characterId') ?? undefined,
          }
        : {}),
    },
    enabled,
  );
  const view = useEditorWorkspace({
    typeKey,
    mode,
    initial: query.data ?? PENDING,
    timeZone: editorTimeZone(timeZone),
    paramHint: params.code ?? params.id ?? params.slug,
    category: params.category,
    enabled: enabled && query.isSuccess,
    actorId: auth.memberId,
    schemaAccess: canAuthorLocations ? LOCATIONS_ACCESS : NO_ACCESS,
    sessionIsCurrent: () => typeKey === 'demo' || auth.isCurrentSession(auth.token),
    onReload: async () => {
      await query.refetch();
    },
  });
  // Only a new quest or summary for a DM the roles cannot settle reads the DM profile.
  const liveDm = useLiveDm(
    mode === 'new' && createNeedsLiveDm(typeKey, me?.roles ?? []),
  );
  const access = createAccessFor(typeKey, mode, reviewAccess, meQuery, liveDm);
  if (query.isError)
    return {
      status: 'error',
      error: toAppError(query.error, 'editor:load'),
      retry: () => void query.refetch(),
      canCreateNew: me ? canCreate(typeKey, { roles: me.roles, liveDm: false }) : false,
    };
  if (access.status === 'error')
    return { status: 'error', error: access.error, retry: access.retry };
  if (query.isPending || !query.data || access.status === 'loading')
    return { status: 'loading' };
  if (access.status === 'forbidden')
    return { status: 'ready', view: { ...view, denied: true, deniedAction: 'create' } };
  // A valid new draft is ready, even when its fields are blank. Missing edits remain AppError.
  return { status: 'ready', view };
}
