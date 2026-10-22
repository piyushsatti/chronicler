import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCharacterBackstory,
  type BackstoryView,
} from '../adapters/characterAdapter.js';

export type BackstoryData =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; error: AppError; retry: () => void }
  | { status: 'missing' }
  | { status: 'ready'; view: BackstoryView };

/** The chosen backstory's name and lore, loaded beside the character so a failure stays in its section. */
export function useCharacterBackstory(
  backstoryId: string | null,
  regionId: string | null,
): BackstoryData {
  const q = useQuery({
    queryKey: queryKeys.characterBackstory(backstoryId ?? '', regionId ?? ''),
    queryFn: () => loadCharacterBackstory(backstoryId ?? '', regionId),
    enabled: Boolean(backstoryId),
  });
  if (!backstoryId) return { status: 'none' };
  if (q.isError)
    return {
      status: 'error',
      error: toAppError(q.error, 'character:backstory'),
      retry: () => void q.refetch(),
    };
  if (q.isPending) return { status: 'loading' };
  if (!q.data) return { status: 'missing' };
  return { status: 'ready', view: q.data };
}
