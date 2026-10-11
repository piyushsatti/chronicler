import { useAdminAuthority, useAuthorityFailures } from './useAdminAuthority.js';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadAdminOperations } from '../adapters/adminAdapter.js';
import type { AdminOpsView } from '../types.js';

export type DeliveryPanelView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; ops: AdminOpsView };

export function useDeliveryPanel(): DeliveryPanelView {
  const authority = useAdminAuthority();
  const opsQ = useQuery({
    enabled: authority.allowed,
    queryKey: queryKeys.adminOperations,
    queryFn: loadAdminOperations,
  });
  useAuthorityFailures(opsQ.error);
  if (opsQ.isError) {
    return { status: 'error', error: toAppError(opsQ.error, 'admin:delivery') };
  }
  if (opsQ.isLoading || !opsQ.data) return { status: 'loading' };
  return { status: 'ready', ops: opsQ.data };
}
