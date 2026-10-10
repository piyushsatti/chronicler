import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute, stubRoute } from '../../chrome/routeBuilders.js';
import goodAdminChars from '../../../tests/fixtures/wire/admin/chars-good.json';
import goodCharPending from '../../../tests/fixtures/wire/admin/char-pending-good.json';
import goodDmQueue from '../../../tests/fixtures/wire/admin/dm-queue-good.json';
import goodAdminOps from '../../../tests/fixtures/wire/admin/ops-good.json';

const pendingCharacterVerifications = '/v1/characters/pending-verifications';

export const endpoints = {
  pendingCharacterVerifications,
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
};

export const handlers: FeatureHandlers = [
  http.get(pendingCharacterVerifications, () => HttpResponse.json(goodCharPending)),
];

export const routes: readonly FeatureRoute[] = [
  stubRoute('/dm', 'DM dashboard'),
  {
    path: '/admin',
    element: lazyElement(() =>
      import('./pages/AdminPage.js').then((module) => ({ default: module.AdminPage })),
    ),
  },
  stubRoute('/admin/people', 'Admin — people'),
  stubRoute('/admin/characters', 'Admin — characters'),
  {
    path: '/admin/review',
    element: lazyElement(() =>
      import('./pages/VerifyPage.js').then((module) => ({ default: module.VerifyPage })),
    ),
  },
  stubRoute('/admin/world', 'Admin — world'),
  stubRoute('/admin/content', 'Admin — content'),
  stubRoute('/admin/delivery', 'Admin — delivery'),
  stubRoute('/admin/data-health', 'Admin — data health'),
  redirectRoute('/admin/overview', '/admin'),
  redirectRoute('/admin/members', '/admin/people'),
  redirectRoute('/admin/home-banner', '/admin/content'),
  redirectRoute('/admin/regions', '/admin/world'),
  redirectRoute('/admin/world-clock', '/admin/world'),
  redirectRoute('/admin/catalogs', '/admin/content'),
  redirectRoute('/admin/ingestion', '/admin/data-health'),
  redirectRoute('/verify', '/admin/review'),
];
