import { HttpResponse } from 'msw';
import type { GraphqlRequestBody } from '../../../src/chrome/featureModule.js';
import { featureGraphql } from '../../../src/chrome/featureRegistry.js';

export function graphqlOperationName(query: string | undefined): string | null {
  const m = (query ?? '').match(/\b(query|mutation)\s+(\w+)/);
  return m?.[2] ?? null;
}

/** Keep MemberMe (and other feature ops) healthy when a test overrides notification GraphQL. */
export function dispatchFeatureGraphql(body: GraphqlRequestBody) {
  const name = graphqlOperationName(body.query);
  if (name && featureGraphql[name]) {
    return featureGraphql[name](body);
  }
  return HttpResponse.json({
    errors: [{ message: 'Unhandled operation', extensions: { code: 'UNHANDLED' } }],
  });
}
