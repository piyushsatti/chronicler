import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  loadAssignments,
  loadMapDirectory,
  loadMapDocument,
  loadRegionActivity,
  loadQuestTitles,
  loadRegionCounts,
} from '../adapters/mapAdapter.js';
import { queryKeys } from '../feature.js';
export function useMapDocument(id: string) {
  const query = useQuery({
    queryKey: queryKeys.mapDocument(id),
    queryFn: () => loadMapDocument(id),
    retry: false,
  });
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}
export function useMapActivity(atlasCode: string) {
  const query = useQuery({
    queryKey: queryKeys.mapRegionActivity(atlasCode),
    queryFn: () => loadRegionActivity(atlasCode),
    retry: false,
  });
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}
function useMapActivityTitles(codes: string[]) {
  return useQuery({
    queryKey: queryKeys.mapQuestTitles(codes),
    queryFn: () => loadQuestTitles(codes),
    enabled: codes.length > 0,
    retry: false,
  });
}
/**
 * One map's activity card: the region's open and live quests, plus their brief
 * titles from a second read. A failed title read is an error with a retry, and
 * rows fall back to the short code rather than inventing a title.
 */
export function useMapActivityCard(atlasCode: string) {
  const activity = useMapActivity(atlasCode);
  const quests = activity.data
    ? [...activity.data.openQuests, ...activity.data.liveQuests]
    : [];
  const titles = useMapActivityTitles(quests.map((quest) => quest.shortCode));
  return {
    activity,
    quests,
    titles: {
      byCode: titles.data ?? {},
      isPending: titles.isPending && quests.length > 0,
      error: titles.isError ? toAppError(titles.error, 'map:quest-titles') : null,
      retry: () => {
        void titles.refetch();
      },
    },
  };
}
export function useRegionDetails(regionId: string) {
  const me = useMe();
  const counts = useQuery({
    queryKey: queryKeys.mapRegionCounts(regionId),
    queryFn: () => loadRegionCounts(regionId),
  });
  const assignments = useQuery({
    queryKey: queryKeys.mapRegionAssignments(regionId),
    queryFn: () => loadAssignments({ regionId }),
    enabled: Boolean(me.data?.roles.includes('admin')),
    retry: false,
  });
  return {
    counts: {
      ...counts,
      retry: () => {
        void counts.refetch();
      },
    },
    assignments,
  };
}
export function useRegionsDirectory() {
  const directory = useQuery({
    queryKey: queryKeys.mapDirectory,
    queryFn: loadMapDirectory,
  });
  return {
    ...directory,
    retry: () => {
      void directory.refetch();
    },
  };
}
export function useRegionPage(slug: string) {
  const directory = useRegionsDirectory();
  const validId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const region = directory.data?.regions.find((item) => item.id === slug);
  return { directory, validId, region };
}
