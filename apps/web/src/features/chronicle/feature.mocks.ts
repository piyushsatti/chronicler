import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodChronicleList from '../../../tests/fixtures/wire/chronicle/list-good.json';
import goodDetail from '../../../tests/fixtures/wire/chronicle/detail-good.json';
import goodCalendar from '../../../tests/fixtures/wire/chronicle/calendar-good.json';

export const graphql: FeatureGraphql = {
  ChronicleList: () =>
    HttpResponse.json({
      data: { documents: goodChronicleList, gameCalendar: goodCalendar },
    }),
  ChronicleDetail: (body) =>
    HttpResponse.json({
      data: { [body.variables?.byId ? 'byId' : 'bySlug']: goodDetail },
    }),
  ChronicleAuthorName: (body) => {
    const handle = String(body.variables?.handle ?? '');
    return HttpResponse.json({
      data: {
        memberProfile: handle
          ? { member: { handle, displayName: handle === 'mira' ? 'Mira' : 'Member' } }
          : null,
      },
    });
  },
};

export const handlers: FeatureHandlers = [];
