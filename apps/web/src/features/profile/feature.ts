import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';

export const endpoints = {} as const;

export const queryKeys = {
  memberProfile: (handle: string) => ['memberProfile', handle] as const,
  dmTable: (slug: string) => ['dm-table', slug] as const,
  dmTableSchedule: (memberId: string, page: number) =>
    ['dm-table', 'schedule', memberId, page] as const,
  profileDmDetails: (memberId: string) => ['profileDmDetails', memberId] as const,
  profileDmTier: ['profileDmTier'] as const,
  profileCharacters: (memberId: string, page: number) =>
    ['profileCharacters', memberId, page] as const,
  profileActivity: (memberId: string) => ['profileActivity', memberId] as const,
  profileHistory: (memberId: string) => ['profileHistory', memberId] as const,
} as const;

export const routes: readonly FeatureRoute[] = [
  {
    path: '/players/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.PlayerProfilePage,
      })),
    ),
  },
  {
    path: '/dms/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DMProfilePage,
      })),
    ),
  },
];
