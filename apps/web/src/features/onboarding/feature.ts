import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {};

export const handlers: FeatureHandlers = [];

function comingSoon(path: string, feature: string): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./pages/ComingSoonPage.js').then((module) => ({
        default: () => module.ComingSoonPage({ feature }),
      })),
    ),
  };
}

export const routes: readonly FeatureRoute[] = [
  {
    path: '/welcome',
    element: lazyElement(() =>
      import('./pages/WelcomePage.js').then((module) => ({ default: module.WelcomePage })),
    ),
  },
  {
    path: '/settings',
    element: lazyElement(() =>
      import('./pages/SettingsPage.js').then((module) => ({ default: module.SettingsPage })),
    ),
  },
  comingSoon('/guilds', 'Guilds'),
  comingSoon('/guilds/:shortCode', 'Guilds'),
  comingSoon('/calendar', 'Calendar'),
  comingSoon('/schedule', 'Schedule'),
  comingSoon('/series/:shortCode', 'Quest series'),
  shortCodeRedirectRoute('/guilds/:shortCode/redirect', '/guilds'),
  shortCodeRedirectRoute('/series/:shortCode/redirect', '/series'),
];
