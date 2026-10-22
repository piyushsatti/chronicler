import { graphqlRequest } from '../../../api/graphql.js';

export type AdminReadRequest = {
  token: string;
  signal?: AbortSignal;
  assertCurrent: () => void;
};

export type AdminCommand = AdminReadRequest & {
  keyFor: (payload: string) => string;
};

export async function adminRead<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  request: AdminReadRequest,
): Promise<T> {
  request.assertCurrent();
  const data = await graphqlRequest<T>(query, variables, {
    headers: { Authorization: `Bearer ${request.token}` },
    signal: request.signal,
  });
  request.assertCurrent();
  return data;
}

export function adminCommand<T>(
  query: string,
  variables: Record<string, unknown>,
  command: AdminCommand,
): Promise<T> {
  command.assertCurrent();
  return adminRead<T>(
    query,
    {
      ...variables,
      meta: { idempotencyKey: command.keyFor(JSON.stringify([query, variables])) },
    },
    command,
  );
}
