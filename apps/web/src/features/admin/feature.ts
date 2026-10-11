import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';
import goodAdminChars from '../../../tests/fixtures/wire/admin/chars-good.json';
import goodCharPending from '../../../tests/fixtures/wire/admin/char-pending-good.json';
import goodDmQueue from '../../../tests/fixtures/wire/admin/dm-queue-good.json';
import goodAdminOps from '../../../tests/fixtures/wire/admin/ops-good.json';
import goodMembers from '../../../tests/fixtures/wire/admin/members-good.json';
import goodHomeBanner from '../../../tests/fixtures/wire/admin/home-banner-good.json';

const pendingCharacterVerifications = '/v1/characters/pending-verifications';
const homeBanner = '/v1/site-settings/home-banner';

export const endpoints = {
  pendingCharacterVerifications,
  homeBanner,
  setMemberRoles: (id: string) => `/v1/members/${id}/roles`,
  decideCharacterVerification: (id: string) =>
    `/v1/characters/${id}/decide-verification`,
  decideDmProfileVerification: (memberId: string) =>
    `/v1/dm-profiles/${memberId}/decide`,
  createRegion: '/v1/regions',
  creationCatalog: '/v1/creation-catalog',
  upsertCreationCatalog: '/v1/admin/creation-catalog',
  createBackstory: '/v1/admin/backstories',
  updateBackstory: (id: string) => `/v1/admin/backstories/${id}`,
} as const;

export const queryKeys = {
  pendingDmProfiles: ['pendingDmProfiles'] as const,
  pendingCharacters: ['pendingCharacters'] as const,
  adminOperations: ['adminOperations'] as const,
  adminCharacters: ['adminCharacters'] as const,
};

export const graphql: FeatureGraphql = {
  PendingDmProfiles: () =>
    HttpResponse.json({ data: { pendingDmProfileVerifications: goodDmQueue } }),
  AdminOperations: () => HttpResponse.json({ data: { adminOperations: goodAdminOps } }),
  AdminCharacters: () =>
    HttpResponse.json({ data: { adminCharacterDirectory: goodAdminChars } }),
  AdminMembers: () => HttpResponse.json({ data: { members: goodMembers } }),
  AdminRegions: () =>
    HttpResponse.json({
      data: {
        regions: [
          {
            id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
            name: 'Lightfall',
            kind: 'server',
            charterDeadline: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.get(pendingCharacterVerifications, () => HttpResponse.json(goodCharPending)),
  http.get(homeBanner, () => HttpResponse.json(goodHomeBanner)),
  http.put(homeBanner, async ({ request }) => HttpResponse.json(await request.json())),
  http.put('/v1/members/:id/roles', () => HttpResponse.json({ ok: true })),
  http.post('/v1/characters/:id/decide-verification', () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post('/v1/dm-profiles/:memberId/decide', () => HttpResponse.json({ ok: true })),
  http.post('/v1/regions', async ({ request }) => {
    const body = (await request.json()) as { name: string; kind: string };
    return HttpResponse.json({
      id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrr01',
      name: body.name,
      kind: body.kind,
      charterDeadline: null,
    });
  }),
  http.get('/v1/creation-catalog', () =>
    HttpResponse.json([
      {
        id: 'opt-1',
        kind: 'class',
        name: 'Ranger',
        description: 'Bow and trail',
        available: true,
        retired: false,
        introducedByRegionId: null,
      },
    ]),
  ),
  http.put('/v1/admin/creation-catalog', async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),
  http.post('/v1/admin/backstories', async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),
  http.patch('/v1/admin/backstories/:id', async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),
];

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
  redirectRoute('/verify', '/admin/review'),
];
