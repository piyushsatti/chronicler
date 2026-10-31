import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadEditorMapOptions,
  loadEditorMapPlaces,
} from '../adapters/editorPointcrawlOptionsAdapter.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadEditorRegions } from '../adapters/editorRegionsAdapter.js';
import { loadQuestGenreOptions } from '../adapters/questGenreOptionsAdapter.js';
import { queryKeys } from '../feature.js';
import { loadEditorGuideGroups } from '../adapters/editorGuideGroupsAdapter.js';
import { loadEditorSeriesOptions } from '../adapters/editorSeriesOptionsAdapter.js';
import { loadEditorVoiceChannels } from '../adapters/editorVoiceChannelsAdapter.js';
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
  /** The signed-in member's id; series options are limited to the series they created. */
  viewerMemberId: string | null = null,
  /** The viewer's roles include admin, so every series is offered (the API decides). */
  viewerIsAdmin = false,
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
  const series = useQuery({
    queryKey: [...queryKeys.seriesOptions, viewerMemberId, viewerIsAdmin],
    queryFn: () => loadEditorSeriesOptions(viewerMemberId ?? '', viewerIsAdmin),
    enabled: enabled && Boolean(viewerMemberId) && schema.some((field) => field.type === 'series'),
  });
  const voiceChannels = useQuery({
    queryKey: queryKeys.voiceChannels,
    queryFn: loadEditorVoiceChannels,
    enabled: enabled && schema.some((field) => field.type === 'voicechannel'),
  });
  // The groups the Rules page already lists; a failed lookup just leaves no suggestions.
  const guideGroups = useQuery({
    queryKey: queryKeys.guideGroups,
    queryFn: loadEditorGuideGroups,
    enabled: enabled && schema.some((field) => field.suggestions === 'guideGroups'),
    staleTime: 300_000,
  });
  const wantsPlaces = enabled && schema.some((field) => field.type === 'pointcrawl');
  const [atlasCode, setAtlasCode] = useState('');
  const maps = useQuery({
    queryKey: ['questOptions', 'maps'],
    queryFn: loadEditorMapOptions,
    enabled: wantsPlaces,
  });
  const places = useQuery({
    queryKey: ['questOptions', 'nodes', atlasCode],
    queryFn: () => loadEditorMapPlaces(atlasCode),
    enabled: wantsPlaces && atlasCode !== '',
  });
  return {
    regions: optionsView(regions, 'editor:regions'),
    genres: optionsView(genres, 'editor:genre-options'),
    series: optionsView(series, 'editor:series-options'),
    voiceChannels: optionsView(voiceChannels, 'editor:voice-channels'),
    guideGroups: guideGroups.data ?? [],
    places: {
      maps: maps.data,
      atlasCode,
      setAtlasCode,
      nodes: places.data?.nodes,
      canEdit: places.data?.canEdit ?? false,
      loading: places.isLoading,
      error: maps.error ?? places.error,
      onRetry: () => {
        void maps.refetch();
        if (atlasCode) void places.refetch();
      },
    },
  };
}
