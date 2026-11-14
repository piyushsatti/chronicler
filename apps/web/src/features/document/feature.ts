import type { FeatureRoute } from '../../chrome/featureModule.js';

/** Wire adapters only — no public `/documents/:slug` route (not in legacy App.tsx). */

export const endpoints = {} as const;

export const queryKeys = {
  document: (slug: string) => ['document', slug] as const,
};

export const routes: readonly FeatureRoute[] = [];
