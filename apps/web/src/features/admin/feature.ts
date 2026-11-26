import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  pendingDmProfiles: ['pendingDmProfiles'] as const,
  pendingCharacters: ['pendingCharacters'] as const,
  adminOperations: ['adminOperations'] as const,
  adminCharacters: ['adminCharacters'] as const,
  adminOperationsPage: (
    cacheKey: string | null,
    deliveryOffset: number,
    alertOffset: number,
  ) => ['adminOperations', cacheKey, deliveryOffset, alertOffset] as const,
  adminPage: (
    base: readonly unknown[],
    cacheKey: string | null,
    filters: object,
    offset: number,
  ) => [...base, cacheKey, filters, offset] as const,
  adminCommunityStats: (cacheKey: string | null) =>
    ['adminCommunityStats', cacheKey] as const,
  adminRegionOptions: (cacheKey?: string | null) =>
    cacheKey === undefined
      ? (['adminRegionOptions'] as const)
      : (['adminRegionOptions', cacheKey] as const),
  adminRegions: (cacheKey?: string | null) =>
    cacheKey === undefined
      ? (['adminRegions'] as const)
      : (['adminRegions', cacheKey] as const),
  adminDiscordSettings: (cacheKey?: string | null) =>
    cacheKey === undefined
      ? (['adminDiscordSettings'] as const)
      : (['adminDiscordSettings', cacheKey] as const),
  adminGameCalendar: (cacheKey?: string | null) =>
    cacheKey === undefined
      ? (['adminGameCalendar'] as const)
      : (['adminGameCalendar', cacheKey] as const),
  adminBackstories: ['adminBackstories'] as const,
  adminCreationCatalog: ['adminCreationCatalog'] as const,
  adminMembers: ['adminMembers'] as const,
  adminTimeAnchors: ['adminTimeAnchors'] as const,
  dmDashboard: (cacheKey: string | null, questOffset: number, questScope: string) =>
    ['dmDashboard', cacheKey, questOffset, questScope] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/dm',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.DMDashboardPage,
      })),
    ),
  },
  {
    path: '/admin',
    element: lazyElement(() =>
      import('./pages/AdminPage.js').then((module) => ({ default: module.AdminPage })),
    ),
  },
  {
    path: '/admin/people',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminPeoplePage,
      })),
    ),
  },
  {
    path: '/admin/characters',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminCharactersPage,
      })),
    ),
  },
  {
    path: '/admin/review',
    element: lazyElement(() =>
      import('./pages/AdminReviewPage.js').then((module) => ({
        default: module.AdminReviewPage,
      })),
    ),
  },
  {
    path: '/admin/world',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminWorldPage,
      })),
    ),
  },
  {
    path: '/admin/content',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminContentPage,
      })),
    ),
  },
  {
    path: '/admin/delivery',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminDeliveryPage,
      })),
    ),
  },
  {
    path: '/admin/data-health',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminDataHealthPage,
      })),
    ),
  },
  redirectRoute('/admin/overview', '/admin'),
  redirectRoute('/admin/members', '/admin/people'),
  redirectRoute('/admin/home-banner', '/admin/content'),
  redirectRoute('/admin/regions', '/admin/world'),
  redirectRoute('/admin/world-clock', '/admin/world'),
  redirectRoute('/admin/catalogs', '/admin/content'),
  redirectRoute('/admin/ingestion', '/admin/data-health'),
  {
    path: '/verify',
    element: lazyElement(() =>
      import('./pages/AdminReviewPage.js').then((module) => ({
        default: module.VerifyPage,
      })),
    ),
  },
];
