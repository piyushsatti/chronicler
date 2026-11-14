import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodSearch from '../../../tests/fixtures/wire/search/good.json';
import goodSearchKinds from '../../../tests/fixtures/wire/search/kinds-good.json';

export const graphql: FeatureGraphql = {
  Search: () => HttpResponse.json({ data: { search: goodSearch } }),
  SearchableKinds: () =>
    HttpResponse.json({ data: { searchableKinds: goodSearchKinds } }),
};

export const handlers: FeatureHandlers = [];
