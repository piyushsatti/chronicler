import { useBackstoriesPanel } from './useBackstoriesPanel.js';
import { useCharacterDirectoryPanel } from './useCharacterDirectoryPanel.js';
import { useCreationCatalogPanel } from './useCreationCatalogPanel.js';
import { useDataHealthPanel } from './useDataHealthPanel.js';
import { useDeliveryPanel } from './useDeliveryPanel.js';
import { useGameCalendarPanel } from './useGameCalendarPanel.js';
import { useHomeBannerPanel } from './useHomeBannerPanel.js';
import { useMembersPanel } from './useMembersPanel.js';
import { useRegionsPanel } from './useRegionsPanel.js';
import { useTimeAnchorPanel } from './useTimeAnchorPanel.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import type { AdminPageData } from '../types.js';

export const useAdminCharactersPage = useCharacterDirectoryPanel;
export const useAdminDeliveryPage = useDeliveryPanel;
export const useAdminDataHealthPage = useDataHealthPanel;

function pageData<T>(
  data: T,
  queries: { isError: boolean; data: unknown; error?: AppError }[],
): AdminPageData<T> {
  const failed = queries.find((query) => query.isError);
  if (failed)
    return { status: 'error', error: failed.error ?? toAppError(null, 'admin:page') };
  if (queries.some((query) => query.data === undefined)) return { status: 'loading' };
  return { status: 'ready', data };
}

export function useAdminPeoplePage() {
  const panel = useMembersPanel();
  return pageData(panel, [panel.directory]);
}

export function useAdminWorldPage() {
  const data = {
    regions: useRegionsPanel(),
    anchors: useTimeAnchorPanel(),
    calendar: useGameCalendarPanel(),
  };
  return pageData(data, [
    data.regions.regions,
    data.anchors.anchors,
    data.calendar.calendar,
  ]);
}

export function useAdminContentPage() {
  const data = {
    home: useHomeBannerPanel(),
    backstories: useBackstoriesPanel(),
    catalog: useCreationCatalogPanel(),
  };
  return pageData(data, [
    data.home.bannerQ,
    data.backstories.backstories,
    data.backstories.regions,
    data.catalog.catalog,
    data.catalog.regions,
  ]);
}

export function useAdminTodayPage() {
  const data = {
    delivery: useDeliveryPanel(),
    characters: useCharacterDirectoryPanel(),
  };
  if (data.delivery.status === 'error')
    return { status: 'error' as const, error: data.delivery.error };
  if (data.characters.status === 'error')
    return { status: 'error' as const, error: data.characters.error };
  if (data.delivery.status === 'loading' || data.characters.status === 'loading')
    return { status: 'loading' as const };
  return { status: 'ready' as const, data };
}

/** DM data has no selected adapter yet. Do not substitute administrator operations. */
export function useDmDashboardPage() {
  return {
    status: 'error' as const,
    error: safeAppError('The DM dashboard is temporarily unavailable.', 'dm:dashboard'),
  };
}
