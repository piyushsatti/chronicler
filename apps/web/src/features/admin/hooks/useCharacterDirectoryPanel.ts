import { useAdminAuthority, useAuthorityFailures } from './useAdminAuthority.js';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadAdminCharacters } from '../adapters/adminAdapter.js';
import type { AdminCharRow } from '../types.js';

export type CharacterDirectoryPanelView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; characters: AdminCharRow[] };

export function useCharacterDirectoryPanel(): CharacterDirectoryPanelView {
  const authority = useAdminAuthority();
  const charsQ = useQuery({
    enabled: authority.allowed,
    queryKey: queryKeys.adminCharacters,
    queryFn: loadAdminCharacters,
  });
  useAuthorityFailures(charsQ.error);
  if (charsQ.isError) {
    return {
      status: 'error',
      error: toAppError(charsQ.error, 'admin:characters'),
    };
  }
  if (charsQ.isLoading || !charsQ.data) return { status: 'loading' };
  if (charsQ.data.length === 0) return { status: 'empty' };
  return { status: 'ready', characters: charsQ.data };
}
