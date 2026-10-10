import { TransportError } from '../errors/types.js';
import { bearerHeaders } from './authHeader.js';

export type Problem = {
  title: string;
  status: number;
  code: string;
};

export async function restRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...bearerHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (cause) {
    throw new TransportError('NETWORK', { cause });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    if (!res.ok) {
      throw new TransportError('HTTP', { status: res.status, cause });
    }
    throw new TransportError('BAD_JSON', { status: res.status, cause });
  }

  if (!res.ok) {
    const problem = body as Partial<Problem>;
    const code =
      typeof problem.code === 'string'
        ? problem.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : 'HTTP';
    throw new TransportError(code, { status: res.status });
  }

  return body as T;
}
