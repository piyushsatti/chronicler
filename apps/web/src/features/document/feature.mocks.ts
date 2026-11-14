import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodDocument from '../../../tests/fixtures/wire/document/good.json';

export const graphql: FeatureGraphql = {
  Document: () => HttpResponse.json({ data: { document: goodDocument } }),
};

export const handlers: FeatureHandlers = [];
