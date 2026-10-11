export type {
  AdminBackstoryRow,
  AdminCatalogEntry,
  AdminCharRow,
  AdminHealthAlert,
  AdminMemberRow,
  AdminOpsView,
  AdminRegionRow,
  AdminTimeAnchorView,
  BatchRoleResult,
  CharVerifyRow,
  DmVerifyRow,
  GameCalendarView,
  HomeBannerView,
} from './adapters/adminAdapter.js';

import type { AppError } from '../../errors/types.js';

export type AdminPageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; data: T };
