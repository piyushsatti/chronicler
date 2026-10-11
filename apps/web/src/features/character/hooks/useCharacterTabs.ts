import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCharacterProgression } from '../adapters/progressionAdapter.js';
import {
  loadCharacterParticipations,
  loadCharacterSummaries,
  loadCoPlayers,
} from '../adapters/characterTabsAdapter.js';

type ListView<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; items: T };

function toListView<T>(
  q: {
    isError: boolean;
    isLoading: boolean;
    error: unknown;
    data: T[] | undefined;
  },
  scope: string,
): ListView<T[]> {
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, scope) };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  if (q.data.length === 0) return { status: 'empty' };
  return { status: 'ready', items: q.data };
}

export function useCharacterProgression(characterId: string) {
  const q = useQuery({
    queryKey: queryKeys.characterProgression(characterId),
    queryFn: () => loadCharacterProgression(characterId),
    enabled: Boolean(characterId),
  });
  return toListView(q, 'character:progression');
}

export function useCharacterHistory(characterId: string) {
  const q = useQuery({
    queryKey: ['characterParticipations', characterId],
    queryFn: () => loadCharacterParticipations(characterId),
    enabled: Boolean(characterId),
  });
  return toListView(q, 'character:history');
}

export function useCharacterConnections(characterId: string) {
  const q = useQuery({
    queryKey: ['characterCoPlayers', characterId],
    queryFn: () => loadCoPlayers(characterId),
    enabled: Boolean(characterId),
  });
  return toListView(q, 'character:connections');
}

export function useCharacterSummaries(characterId: string) {
  const q = useQuery({
    queryKey: ['characterSummaries', characterId],
    queryFn: () => loadCharacterSummaries(characterId),
    enabled: Boolean(characterId),
  });
  return toListView(q, 'character:summaries');
}
