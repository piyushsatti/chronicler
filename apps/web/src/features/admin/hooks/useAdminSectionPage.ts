import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadAdminCommunityStats, loadCharVerifyQueue } from '../adapters/adminAdapter.js';
import { panelState, useAdminAuthority } from './useAdminAuthority.js';
import { useAdminPage } from './useAdminPage.js';
import { useAdminOperations } from './useAdminOperations.js';
import { useBackstoriesPanel } from './useBackstoriesPanel.js';
import { useCharacterDirectoryPanel } from './useCharacterDirectoryPanel.js';
import { useCreationCatalogPanel } from './useCreationCatalogPanel.js';
import { useGameCalendarPanel } from './useGameCalendarPanel.js';
import { useDiscordSettingsPanel } from './useDiscordSettingsPanel.js';
import { useHomeBannerPanel } from './useHomeBannerPanel.js';
import { useMembersPanel } from './useMembersPanel.js';
import { useRegionsPanel } from './useRegionsPanel.js';
import { useTimeAnchorPanel } from './useTimeAnchorPanel.js';
export const useAdminCharactersPage = useCharacterDirectoryPanel;
export const useAdminDeliveryPage = useAdminOperations;
export const useDiscordSettingsPage = useDiscordSettingsPanel;
export const useAdminDataHealthPage = useAdminOperations;

export function useAdminPeoplePage() {
  const panel = useMembersPanel();
  return { status: 'ready' as const, data: panel };
}

export function useAdminWorldPage() {
  const data = {
    regions: useRegionsPanel(),
    anchors: useTimeAnchorPanel(),
    calendar: useGameCalendarPanel(),
  };
  return { status: 'ready' as const, data };
}

export function useAdminContentPage() {
  const data = {
    home: useHomeBannerPanel(),
    backstories: useBackstoriesPanel(),
    catalog: useCreationCatalogPanel(),
  };
  return { status: 'ready' as const, data };
}

/** Pending character verifications, read only for the overview's count. */
function useReviewQueueCount(): number | null {
  const authority = useAdminAuthority('review');
  const { query, pagination } = useAdminPage(
    queryKeys.pendingCharacters,
    authority,
    {},
    (page, request) => loadCharVerifyQueue(page, request),
  );
  if (query.isError || !query.data) return null;
  return pagination.total ?? query.data.length;
}

function useAdminCommunityStats() {
  const authority = useAdminAuthority();
  const query = useQuery({
    enabled: authority.allowed,
    queryKey: ['adminCommunityStats', authority.cacheKey],
    queryFn: ({ signal }) =>
      authority.read((request) => loadAdminCommunityStats(request), signal),
  });
  return { ...panelState(query, 'admin:community-stats'), retry: () => void query.refetch() };
}

export function useAdminTodayPage() {
  const delivery = useAdminOperations();
  const characters = useCharacterDirectoryPanel({ withRegionOptions: false });
  const reviewTotal = useReviewQueueCount();
  const stats = useAdminCommunityStats();
  if (delivery.query.isError)
    return {
      status: 'error' as const,
      error: delivery.query.error,
      retry: delivery.retry,
    };
  // Stats load inside their own card. A slow or failed read must not hide alerts.
  if (!delivery.query.data) return { status: 'loading' as const };
  return {
    status: 'ready' as const,
    data: {
      ops: delivery.query.data,
      stats,
      // The directory count is a convenience; a failed read shows a dash, not an error page.
      characterTotal: characters.query.data ? characters.pagination.total : null,
      reviewTotal,
    },
  };
}

export { useDmDashboard as useDmDashboardPage } from '../../../hooks/useDmDashboard.js';
