import { useAdminAuthority, useAuthorityFailures } from './useAdminAuthority.js';
import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadAdminOperations } from '../adapters/adminAdapter.js';
import type { AdminOpsView } from '../types.js';

export type DataHealthPanelView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; ops: AdminOpsView };

export function useDataHealthPanel(): DataHealthPanelView {
  const authority = useAdminAuthority();
  const ops = useQuery({
    enabled: authority.allowed,
    queryKey: ['adminOperations'],
    queryFn: loadAdminOperations,
  });
  useAuthorityFailures(ops.error);
  if (ops.isError) {
    return { status: 'error', error: toAppError(ops.error, 'admin:data-health') };
  }
  if (ops.isLoading || !ops.data) return { status: 'loading' };
  return { status: 'ready', ops: ops.data };
}
