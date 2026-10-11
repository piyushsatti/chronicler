import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import { loadEditorRegions } from '../adapters/editorRegionsAdapter.js';
import { loadQuestGenreOptions } from '../adapters/questGenreOptionsAdapter.js';
import { queryKeys } from '../feature.js';
import type { EditorFieldOptions, EditorOptions, FieldSchema } from '../types.js';

function optionsView<T>(
  query: {
    isError: boolean;
    isPending: boolean;
    error: unknown;
    data: T[] | undefined;
    refetch: () => Promise<unknown>;
  },
  context: string,
): EditorOptions<T> {
  if (query.isError)
    return {
      status: 'error',
      error: toAppError(query.error, context),
      onRetry: () => {
        void query.refetch();
      },
    };
  if (query.isPending || !query.data) return { status: 'loading' };
  if (query.data.length === 0) return { status: 'empty' };
  return { status: 'ready', items: query.data };
}

/** Field options are independent of record loading; a failed field does not hide the draft. */
export function useEditorOptions(
  schema: FieldSchema[],
  enabled: boolean,
): EditorFieldOptions {
  const regions = useQuery({
    queryKey: queryKeys.regions,
    queryFn: loadEditorRegions,
    enabled:
      enabled &&
      schema.some((field) => field.type === 'region' || field.type === 'regionmulti'),
  });
  const genres = useQuery({
    queryKey: queryKeys.genres,
    queryFn: loadQuestGenreOptions,
    enabled: enabled && schema.some((field) => field.type === 'genretags'),
    staleTime: 300_000,
  });
  return {
    regions: optionsView(regions, 'editor:regions'),
    genres: optionsView(genres, 'editor:genre-options'),
  };
}
