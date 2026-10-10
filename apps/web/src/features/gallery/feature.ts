import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { stubRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  stubRoute('/gallery', 'Design gallery'),
];
