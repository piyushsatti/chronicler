import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodRulesList from '../../../tests/fixtures/wire/rules/list-good.json';

export const graphql: FeatureGraphql = {
  RulesList: () => HttpResponse.json({ data: { documents: goodRulesList } }),
  RuleDetail: (body) =>
    HttpResponse.json({
      data: {
        documentBacklinks: [],
        document:
          goodRulesList.items.find((item) => item.slug === body.variables?.slug) ??
          null,
      },
    }),
};

export const handlers: FeatureHandlers = [];
