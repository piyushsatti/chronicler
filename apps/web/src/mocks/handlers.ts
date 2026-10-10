import { http, HttpResponse } from 'msw';
import { GRAPHQL_PATH } from '../api/endpoints.js';
import {
  featureGraphql,
  featureHandlers,
} from '../chrome/featureRegistry.js';
import type { GraphqlRequestBody } from '../chrome/featureModule.js';

function graphqlOperationName(body: GraphqlRequestBody): string | null {
  const q = body.query ?? '';
  const m = q.match(/\b(query|mutation)\s+(\w+)/);
  return m?.[2] ?? null;
}

export const handlers = [
  ...featureHandlers,
  http.post(GRAPHQL_PATH, async ({ request }) => {
    const body = (await request.json()) as GraphqlRequestBody;
    const name = graphqlOperationName(body);
    if (name && featureGraphql[name]) {
      return featureGraphql[name](body);
    }
    return HttpResponse.json({
      errors: [
        { message: 'Unhandled operation', extensions: { code: 'UNHANDLED' } },
      ],
    });
  }),
];
