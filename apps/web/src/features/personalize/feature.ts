import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodPersonalization from '../../../tests/fixtures/wire/personalize/good.json';

const reconcilePersonalization = '/v1/me/personalization/reconcile';
const equipCosmetic = '/v1/me/cosmetics/equip';

export const endpoints = {
  reconcilePersonalization,
  equipCosmetic,
} as const;

export const queryKeys = {
  personalization: ['personalization'] as const,
};

export const graphql: FeatureGraphql = {
  MyPersonalization: () =>
    HttpResponse.json({ data: { myPersonalization: goodPersonalization } }),
};

export const handlers: FeatureHandlers = [
  http.post(reconcilePersonalization, () => HttpResponse.json({ ok: true })),
  http.post(equipCosmetic, () => HttpResponse.json({ ok: true })),
];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/me/personalize',
    element: lazyElement(() =>
      import('./pages/PersonalizePage.js').then((module) => ({
        default: module.PersonalizePage,
      })),
    ),
  },
];
