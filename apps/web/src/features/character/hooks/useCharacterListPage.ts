import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadMyCharacters } from '../adapters/characterAdapter.js';
import type { CharacterViewModel } from '../types.js';

export type CharacterListPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; characters: CharacterViewModel[] };

export function useCharacterListPage(): CharacterListPageView {
  const q = useQuery({
    queryKey: queryKeys.characters('mine'),
    queryFn: loadMyCharacters,
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'character:list') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  if (q.data.length === 0) return { status: 'empty' };
  return { status: 'ready', characters: q.data };
}
