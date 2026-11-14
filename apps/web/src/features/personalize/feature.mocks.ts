import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodPersonalization from '../../../tests/fixtures/wire/personalize/good.json';

export const graphql: FeatureGraphql = {
  MyPersonalization: () =>
    HttpResponse.json({ data: { myPersonalization: goodPersonalization } }),
  UpdateMySettings: () =>
    HttpResponse.json({
      data: { updateMySettings: goodPersonalization.settings },
    }),
};

export const handlers: FeatureHandlers = [];
