import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { stubRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  stubRoute('/players/:shortCode', 'Player profile'),
  stubRoute('/dms/:shortCode', 'DM profile'),
  stubRoute('/community/dm-table/:slug', 'DM table detail'),
];
