import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import goodDocument from '../../../tests/fixtures/wire/document/good.json';

/** Wire adapters only — no public `/documents/:slug` route (not in legacy App.tsx). */

export const endpoints = {} as const;

export const queryKeys = {
  document: (slug: string) => ['document', slug] as const,
};

export const graphql: FeatureGraphql = {
  Document: () => HttpResponse.json({ data: { document: goodDocument } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [];
