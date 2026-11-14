import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import retained from '../../../tests/fixtures/wire/onboarding/retained-good.json';

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
