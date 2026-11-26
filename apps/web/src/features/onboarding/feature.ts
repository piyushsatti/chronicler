import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { createElement } from 'react';
import { SeriesRedirect } from './SeriesRedirect.js';

export const endpoints = {} as const;

export const queryKeys = {
  calendar: (month: string | undefined, day: string | undefined) =>
    ['calendar', month, day] as const,
  calendarQuests: (state: object | null, timeZone: string | null) =>
    ['calendarQuests', state, timeZone] as const,
  calendarRealDates: (gameDay: number | undefined, realPage: number | undefined) =>
    ['calendarRealDates', gameDay, realPage] as const,
  retainedDocument: (identity: string | undefined) => ['retainedDocument', identity] as const,
  seriesAuthority: (actorIdentity?: string | null) =>
    actorIdentity === undefined
      ? (['seriesAuthority'] as const)
      : (['seriesAuthority', actorIdentity] as const),
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/welcome',
    element: lazyElement(() =>
      import('./pages/WelcomePage.js').then((module) => ({
        default: module.WelcomePage,
      })),
    ),
  },
  {
    path: '/me/settings',
    element: lazyElement(() =>
      import('./pages/SettingsPage.js').then((module) => ({
        default: module.SettingsPage,
      })),
    ),
  },
  {
    path: '/settings',
    element: lazyElement(() =>
      import('./pages/SettingsPage.js').then((module) => ({
        default: module.SettingsRedirectPage,
      })),
    ),
  },
  ...['/guilds', '/guilds/:shortCode', '/guilds/:shortCode/redirect'].map((path) => ({
    path,
    element: lazyElement(() =>
      import('./pages/RetainedAliasesPage.js').then((module) => ({
        default: module.GuildAliasPage,
      })),
    ),
  })),
  {
    path: '/calendar',
    element: lazyElement(() =>
      import('./pages/CalendarPage.js').then((module) => ({
        default: module.CalendarPage,
      })),
    ),
  },
  {
    path: '/schedule',
    element: lazyElement(() =>
      import('./pages/RetainedAliasesPage.js').then((module) => ({
        default: module.ScheduleAliasPage,
      })),
    ),
  },
  {
    path: '/series/:shortCode',
    element: lazyElement(() =>
      import('./pages/SeriesPage.js').then((module) => ({
        default: module.SeriesPage,
      })),
    ),
  },
  // Eager and data-free, so the legacy URL never paints the series page first.
  { path: '/series/:shortCode/redirect', element: createElement(SeriesRedirect) },
];
