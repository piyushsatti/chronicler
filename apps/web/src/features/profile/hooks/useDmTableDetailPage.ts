import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import {
  loadProfileHub,
} from '../adapters/profileCommunityAdapter.js';
import {
  loadDmTableBySlug,
  loadDmTableSchedule,
} from '../adapters/dmTableAdapter.js';

export function useDmTableDetailPage(slug: string) {
  const hub = useQuery({
    queryKey: queryKeys.communityHub,
    queryFn: loadProfileHub,
  });
  const doc = useQuery({
    queryKey: [...queryKeys.document(slug), 'dm-table'] as const,
    queryFn: () => loadDmTableBySlug(slug),
    enabled: slug.length > 0,
  });

  const host = hub.data?.dms.find(
    (dm) =>
      dm.handle.toLowerCase() === slug.toLowerCase() ||
      dm.displayName.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase() ||
      (doc.data?.authorHandle ?? '').toLowerCase() === dm.handle.toLowerCase(),
  );
  const scheduleHandle = doc.data?.authorHandle ?? host?.handle ?? '';
  const schedule = useQuery({
    queryKey: ['dm-table', 'schedule', scheduleHandle] as const,
    queryFn: () => loadDmTableSchedule(scheduleHandle),
    enabled: scheduleHandle.length > 0,
  });

  return {
    hub,
    doc,
    host,
    schedule,
    title: doc.data?.title ?? host?.displayName ?? slug,
    loading: hub.isLoading || doc.isLoading,
    error: hub.isError || doc.isError,
  };
}
