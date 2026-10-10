import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { shortCodeRedirectRoute, stubRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  stubRoute('/welcome', 'Welcome'),
  stubRoute('/settings', 'Settings'),
  stubRoute('/guilds', 'Guilds — coming soon'),
  stubRoute('/guilds/:shortCode', 'Guilds — coming soon'),
  stubRoute('/calendar', 'Calendar — coming soon'),
  stubRoute('/schedule', 'Schedule — coming soon'),
  stubRoute('/series/:shortCode', 'Quest series — coming soon'),
  shortCodeRedirectRoute('/guilds/:shortCode/redirect', '/guilds'),
  shortCodeRedirectRoute('/series/:shortCode/redirect', '/series'),
];
