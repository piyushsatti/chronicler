import { GRAPHQL_PATH } from './endpoints.js';
import { bearerHeaders } from './authHeader.js';
import { TransportError } from '../errors/types.js';

export type GraphQLEnvelope<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

/**
 * POST /v1/graphql. Non-empty errors[] is always failure (data dropped).
 */
export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(GRAPHQL_PATH, {
      method: 'POST',
      ...init,
      headers: {
        ...bearerHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new TransportError('NETWORK', { cause });
  }

  let body: GraphQLEnvelope<T>;
  try {
    body = (await res.json()) as GraphQLEnvelope<T>;
  } catch (cause) {
    throw new TransportError('BAD_JSON', { status: res.status, cause });
  }

  if (body.errors && body.errors.length > 0) {
    const code = body.errors[0]?.extensions?.code ?? 'GRAPHQL';
    throw new TransportError(code, {
      status: res.status || 200,
      serverMessage: body.errors[0]?.message,
    });
  }

  if (!res.ok) {
    throw new TransportError('HTTP', { status: res.status });
  }

  if (body.data === undefined) {
    throw new TransportError('EMPTY_DATA', { status: res.status });
  }

  return body.data;
}
