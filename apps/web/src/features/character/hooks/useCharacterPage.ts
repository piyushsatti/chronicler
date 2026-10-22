import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCharacter,
  type CharacterViewModel,
} from '../adapters/characterAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useCharacterPage(shortCode: string): PageData<CharacterViewModel> {
  const q = useQuery({
    queryKey: queryKeys.character(shortCode),
    queryFn: () => loadCharacter({ shortCode }),
    enabled: Boolean(shortCode),
  });
  const error = q.isError ? toAppError(q.error, 'character:page') : null;
  if (error && error.kind !== 'not_found') return { status: 'error', error };
  if (q.isLoading || (!q.data && !error)) return { status: 'loading' };
  if (!q.data) return { status: 'empty' };
  return { status: 'ready', view: q.data };
}
