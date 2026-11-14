import type { HttpHandler } from 'msw';
import type { HttpResponse } from 'msw';
import type { GraphqlRequestBody } from '../chrome/featureModule.js';

export type FeatureGraphqlHandler = (
  body: GraphqlRequestBody,
) => ReturnType<typeof HttpResponse.json>;

export type FeatureGraphql = Readonly<Record<string, FeatureGraphqlHandler>>;

export type FeatureHandlers = readonly HttpHandler[];

export type FeatureMockSlice = {
  readonly handlers: FeatureHandlers;
  readonly graphql: FeatureGraphql;
};
