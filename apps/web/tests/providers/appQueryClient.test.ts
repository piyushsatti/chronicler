import { describe, expect, it } from 'vitest';
import { createAppQueryClient } from '../../src/providers.js';
import { toAppError } from '../../src/errors/toAppError.js';
import { TransportError } from '../../src/errors/types.js';
import type { AppError } from '../../src/errors/types.js';

function retryFn() {
  const retry = createAppQueryClient().getDefaultOptions().queries?.retry;
  expect(typeof retry).toBe('function');
  return retry as (failureCount: number, error: unknown) => boolean;
}

describe('createAppQueryClient retry', () => {
  it('retries NETWORK and 5xx, including when wrapped in AppError', () => {
    const retry = retryFn();
    expect(retry(0, new TransportError('NETWORK'))).toBe(true);
    expect(retry(0, new TransportError('HTTP', { status: 503 }))).toBe(true);
    expect(retry(0, toAppError(new TransportError('NETWORK'), 't'))).toBe(true);
    expect(retry(0, toAppError(new TransportError('HTTP', { status: 503 }), 't'))).toBe(
      true,
    );
  });

  it('does not retry 4xx, GraphQL-at-200, or AppError without transport cause', () => {
    const retry = retryFn();
    expect(retry(0, new TransportError('HTTP', { status: 401 }))).toBe(false);
    expect(retry(0, new TransportError('HTTP', { status: 403 }))).toBe(false);
    expect(retry(0, new TransportError('HTTP', { status: 404 }))).toBe(false);
    expect(retry(0, new TransportError('HTTP', { status: 422 }))).toBe(false);
    expect(retry(0, new TransportError('INTERNAL', { status: 200 }))).toBe(false);
    const plain: AppError = {
      kind: 'unknown',
      userMessage: 'x',
      cause: new Error('nope'),
    };
    expect(retry(0, plain)).toBe(false);
  });

  it('never retries more than twice', () => {
    const retry = retryFn();
    const err = new TransportError('NETWORK');
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(true);
    expect(retry(2, err)).toBe(false);
  });

  it('sets staleTime 30s and mutations never retry', () => {
    const client = createAppQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
