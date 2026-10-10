import type { AppError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { HomeLanesViewModel } from '../adapters/homeLanesAdapter.js';
import { useHomeLanes } from './useHomeLanes.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useHomePage(): PageData<HomeLanesViewModel> {
  const lanes = useHomeLanes();

  if (lanes.isError) {
    return {
      status: 'error',
      error: toAppError(lanes.error, 'home:page'),
    };
  }
  if (lanes.isLoading || !lanes.data) {
    return { status: 'loading' };
  }
  const allEmpty =
    lanes.data.recruiting.length === 0 &&
    lanes.data.upcoming.length === 0 &&
    lanes.data.recentlyClosed.length === 0 &&
    lanes.data.dmsAccepting.length === 0;
  if (allEmpty) {
    return { status: 'empty' };
  }
  return { status: 'ready', view: lanes.data };
}
