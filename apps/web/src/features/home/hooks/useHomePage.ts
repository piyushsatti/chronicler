import type { AppError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { HomeViewModel } from '../adapters/homeAdapter.js';
import type { HomeLanesViewModel } from '../adapters/homeLanesAdapter.js';
import { useHome } from './useHome.js';
import { useHomeLanes } from './useHomeLanes.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export type HomePageView = {
  buckets: HomeViewModel;
  lanes: HomeLanesViewModel;
};

function lanesAreEmpty(lanes: HomeLanesViewModel): boolean {
  return (
    lanes.recruiting.length === 0 &&
    lanes.upcoming.length === 0 &&
    lanes.recentlyClosed.length === 0 &&
    lanes.dmsAccepting.length === 0
  );
}

function bucketsAreEmpty(buckets: HomeViewModel): boolean {
  return buckets.headingTitle == null && buckets.recentByCategory.every((b) => b.documents.length === 0);
}

export function useHomePage(): PageData<HomePageView> {
  const buckets = useHome();
  const lanes = useHomeLanes();

  if (buckets.isError) {
    return {
      status: 'error',
      error: toAppError(buckets.error, 'home:page'),
    };
  }
  if (lanes.isError) {
    return {
      status: 'error',
      error: toAppError(lanes.error, 'home:page'),
    };
  }
  if (buckets.isLoading || !buckets.data || lanes.isLoading || !lanes.data) {
    return { status: 'loading' };
  }
  // Archive buckets are demoted; ready when Legacy lanes OR demoted archive has content.
  if (lanesAreEmpty(lanes.data) && bucketsAreEmpty(buckets.data)) {
    return { status: 'empty' };
  }
  return {
    status: 'ready',
    view: { buckets: buckets.data, lanes: lanes.data },
  };
}
