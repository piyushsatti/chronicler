import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { canAccessVerify, isAdmin, isDm } from '../../../auth/roles.js';
import { toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';

export type WorkspaceAuthority = 'admin' | 'review' | 'dm';

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
  useEffect(() => {
    for (const error of errors) report(error);
  });
  return { report, permissionsChanged };
}

export function useAuthorityFailures(...errors: unknown[]): void {
  const reportPageError = useContext(AuthorityFailureContext);
  const reportLocalError = usePageAuthorityFailures();
  const report = reportPageError ?? reportLocalError.report;
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
    : required === 'dm'
      ? isDm(roles)
      : isAdmin(roles);
}

export function useAdminAuthority(required: WorkspaceAuthority = 'admin') {
  const queryClient = useQueryClient();
  const me = useMe();
  const roles = me.isSuccess ? me.data.roles : undefined;
  const allowed = permits(roles, required);
  const error: AppError | null = me.isError
    ? toAppError(me.error, 'workspace:account')
    : me.isSuccess && !allowed
      ? toAppError(
          new TransportError('FORBIDDEN', { status: 403 }),
          'workspace:account',
        )
      : null;

  function guardMutation<TAction extends (...args: never[]) => unknown>(
    action: TAction,
  ): TAction {
    return ((...args: never[]) => {
      // Read the validated useMe cache at invocation too: a retained event handler
      // must not keep authority after a refetch has changed the member's roles.
      const current = queryClient.getQueryState<NonNullable<typeof me.data>>(
        queryKeys.me,
      );
      if (current?.status !== 'success') {
        throw toAppError(
          current?.error ?? { failure: 'Unauthorized' },
          'workspace:mutation',
        );
      }
      if (!permits(current.data?.roles, required)) {
        throw toAppError(
          new TransportError('FORBIDDEN', { status: 403 }),
          'workspace:mutation',
        );
      }
      return action(...args);
    }) as TAction;
  }

  return {
    allowed,
    status: error
      ? ('error' as const)
      : allowed
        ? ('ready' as const)
        : ('loading' as const),
    error,
    roles,
    guardMutation,
    reload: () => {
      void me.refetch();
    },
  };
}
