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
  if (q.isError)
    return { status: 'error', error: toAppError(q.error, 'character:page') };
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
