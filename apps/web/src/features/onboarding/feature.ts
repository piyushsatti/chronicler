import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { createElement } from 'react';
import { SeriesRedirect } from './SeriesRedirect.js';
import { HttpResponse } from 'msw';
import retained from '../../../tests/fixtures/wire/onboarding/retained-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  seriesAuthority: (actorIdentity?: string | null) =>
    actorIdentity === undefined
      ? (['seriesAuthority'] as const)
      : (['seriesAuthority', actorIdentity] as const),
};

export const graphql: FeatureGraphql = {
  RetainedCalendar: ({ variables }) =>
    HttpResponse.json({
      data: {
        gameCalendar: retained.calendar,
        gameDate:
          variables?.selectedDate === '2026-10-14'
            ? retained.calendar.currentGameDate
            : null,
      },
    }),
  RetainedCalendarQuests: () =>
    HttpResponse.json({ data: { quests: { items: [], total: 0 } } }),
  RetainedRealDates: () =>
    HttpResponse.json({ data: { realDates: { items: [], total: 0 } } }),
  RetainedSeriesArc: ({ variables }) =>
    HttpResponse.json({
      data: { questArc: variables?.id === retained.arc.id ? retained.arc : null },
    }),
  RetainedSeriesAuthority: () =>
    HttpResponse.json({
      data: {
        memberProfile: {
          member: { id: retained.arc.createdBy, status: 'active', roles: ['dm'] },
          dmProfile: { status: 'approved' },
        },
      },
    }),
  RetainedUpsertArc: ({ variables }) =>
    HttpResponse.json({
      data: { upsertQuestArc: { ...retained.arc, name: variables?.name } },
    }),
  RetainedDocumentById: ({ variables }) =>
    HttpResponse.json({
      data: {
        documentById: variables?.id === retained.document.id ? retained.document : null,
      },
    }),
  RetainedDocumentBySlug: ({ variables }) =>
    HttpResponse.json({
      data: {
        document: variables?.slug === retained.document.slug ? retained.document : null,
      },
    }),
};

export const handlers: FeatureHandlers = [];

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
