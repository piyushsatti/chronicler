import type { AppError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { HomeLanesViewModel } from '../adapters/homeLanesAdapter.js';
import { useHomeLanes } from './useHomeLanes.js';
import { useHomePresentation } from './useHomePresentation.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export type HomePageView = {
  lanes: HomeLanesViewModel;
} & ReturnType<typeof useHomePresentation>;

function lanesAreEmpty(lanes: HomeLanesViewModel): boolean {
  return (
    lanes.totals.questBoard === 0 &&
    lanes.totals.upcoming === 0 &&
    lanes.totals.recentlyClosed === 0 &&
    lanes.totals.dmsAccepting === 0
  );
}

export function useHomePage(): PageData<HomePageView> {
  const lanes = useHomeLanes();
  const presentation = useHomePresentation(lanes.data?.recruiting ?? []);
  if (lanes.isError) {
    return {
      status: 'error',
      error: toAppError(lanes.error, 'home:page'),
    };
  }
  if (lanes.isLoading || !lanes.data) {
    return { status: 'loading' };
  }
  if (lanesAreEmpty(lanes.data)) {
    return { status: 'empty' };
  }
  return {
    status: 'ready',
    view: { lanes: lanes.data, ...presentation },
  };
}
