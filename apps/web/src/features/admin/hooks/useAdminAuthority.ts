import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { canAccessVerify, hasRole, isAdmin, isDm } from '../../../auth/roles.js';
import { toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import { useFencedMutation } from '../../../hooks/useFencedMutation.js';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import type { AdminCommand, AdminReadRequest } from '../adapters/adminRequest.js';

export type WorkspaceAuthority = 'admin' | 'review' | 'verifier' | 'dm';

/** One permission refresh budget belongs to the mounted route, including its tabs. */
export const AuthorityFailureContext = createContext<((error: unknown) => void) | null>(
  null,
);

export function usePageAuthorityFailures(...errors: unknown[]) {
  const queryClient = useQueryClient();
  const invalidated = useRef(false);
  const [permissionsChanged, setPermissionsChanged] = useState(false);
  const report = (error: unknown): void => {
    if (
      error &&
      toAppError(error, 'workspace:authority').kind === 'forbidden' &&
      !invalidated.current
    ) {
      invalidated.current = true;
      setPermissionsChanged(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    }
  };
  // No deps: re-scan the latest errors every render; invalidate me at most once.
  useEffect(() => {
    for (const error of errors) report(error);
  });
  return { report, permissionsChanged };
}

export function useAuthorityFailures(...errors: unknown[]): void {
  const reportPageError = useContext(AuthorityFailureContext);
  const reportLocalError = usePageAuthorityFailures();
  const report = reportPageError ?? reportLocalError.report;
  // No deps: re-scan the latest errors every render via the active reporter.
  useEffect(() => {
    for (const error of errors) report(error);
  });
}

/** Views receive controlled errors, never transport objects or raw messages. */
export function panelState<T extends { error: unknown }>(state: T, context: string) {
  return {
    ...state,
    error: state.error ? toAppError(state.error, context) : undefined,
  };
}

function permits(
  roles: readonly string[] | undefined,
  required: WorkspaceAuthority,
): boolean {
  return required === 'review'
    ? canAccessVerify(roles)
    : required === 'verifier'
      ? hasRole(roles, 'verifier')
      : required === 'dm'
        ? isDm(roles)
        : isAdmin(roles);
}

export function useAdminAuthority(required: WorkspaceAuthority = 'admin') {
  const queryClient = useQueryClient();
  const me = useMe();
  const roles = me.isSuccess ? me.data.roles : undefined;
  const adminAccess = useCurrentAccess('admin');
  const reviewAccess = useCurrentAccess('review');
  const proof =
    required === 'review' || required === 'verifier' ? reviewAccess : adminAccess;
  const allowed =
    required === 'verifier'
      ? // Review proof also admits admins; this authority does not.
        permits(roles, required) && proof.allowed
      : required === 'dm'
        ? permits(roles, required) || adminAccess.allowed
        : proof.allowed;
  const error: AppError | null = me.isError
    ? toAppError(me.error, 'workspace:account')
    : required === 'verifier' && me.isSuccess && !permits(roles, required)
      ? toAppError(new TransportError('FORBIDDEN', { status: 403 }), 'workspace:account')
      : required !== 'dm' && proof.status === 'error'
        ? proof.error
        : me.isSuccess && !allowed && proof.status === 'forbidden'
          ? toAppError(
              new TransportError('FORBIDDEN', { status: 403 }),
              'workspace:account',
            )
          : null;

  const identity = me.isSuccess
    ? JSON.stringify([me.data.id, [...me.data.roles].sort()])
    : null;

  const fence = useFencedMutation({
    context: 'workspace:session',
    assert: () => {
      const account = queryClient.getQueryState<NonNullable<typeof me.data>>(
        queryKeys.me,
      );
      if (!account?.data) {
        throw toAppError({ failure: 'Unauthorized' }, 'workspace:session');
      }
      if (
        required === 'verifier'
          ? !permits(account.data.roles, required) || !proof.isCurrentProof()
          : required === 'dm'
            ? !permits(account.data.roles, required) && !adminAccess.isCurrentProof()
            : !proof.isCurrentProof()
      ) {
        throw toAppError(
          new TransportError('FORBIDDEN', { status: 403 }),
          'workspace:mutation',
        );
      }
    },
    run: async () => {
      throw toAppError(new TransportError('CONFLICT'), 'workspace:busy');
    },
  });

  function guardMutation<TArgs extends unknown[], TResult>(
    action: (command: AdminCommand, ...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => Promise<TResult> {
    return (...args) =>
      fence.runExclusive(async (cmd) => {
        const command: AdminCommand = {
          token: cmd.token,
          signal: cmd.signal,
          assertCurrent: fence.assertCurrent,
          keyFor: cmd.keyFor,
        };
        return action(command, ...args);
      });
  }

  async function read<TResult>(
    action: (request: AdminReadRequest) => Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    fence.assertCurrent();
    if (!fence.token)
      throw toAppError({ failure: 'Unauthorized' }, 'workspace:session');
    const request: AdminReadRequest = {
      token: fence.token,
      signal,
      assertCurrent: fence.assertCurrent,
    };
    const result = await action(request);
    fence.assertCurrent();
    return result;
  }

  return {
    allowed,
    status:
      me.isError || proof.status === 'error' || error
        ? ('error' as const)
        : allowed
          ? ('ready' as const)
          : ('loading' as const),
    error,
    roles,
    canAdmin: adminAccess.allowed,
    canReview: reviewAccess.allowed,
    isCurrent: () => {
      try {
        fence.assertCurrent();
        return true;
      } catch {
        return false;
      }
    },
    guardMutation,
    read,
    actorId: me.isSuccess ? me.data.id : null,
    cacheKey: identity,
    commandKey: fence.sessionKey,
    reload: () => {
      void me.refetch();
      if (required !== 'dm') proof.reload();
    },
  };
}
