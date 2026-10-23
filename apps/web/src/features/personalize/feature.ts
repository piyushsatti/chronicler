import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodPersonalization from '../../../tests/fixtures/wire/personalize/good.json';

export const endpoints = {} as const;

export const queryKeys = {
  personalization: ['personalization'] as const,
};

export const graphql: FeatureGraphql = {
  MyPersonalization: () =>
    HttpResponse.json({ data: { myPersonalization: goodPersonalization } }),
  UpdateMySettings: () =>
    HttpResponse.json({
      data: { updateMySettings: goodPersonalization.settings },
    }),
};

export const handlers: FeatureHandlers = [];

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
