import type { AdapterFailure, AppError, AppErrorKind } from './types.js';
import { TransportError } from './types.js';

const FIXED: Record<Exclude<AppErrorKind, 'safe'>, string> = {
  network: 'Could not reach the server. Check your connection and try again.',
  unauthorized: 'Your session ended. Sign in again.',
  forbidden: 'Permissions may have changed. Reload or sign in again.',
  not_found: 'That item could not be found.',
  invalid: 'The server returned data this screen cannot use.',
  upstream: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function adapterFailureToKind(failure: AdapterFailure): AppErrorKind {
  switch (failure) {
    case 'NotFound':
      return 'not_found';
    case 'Unauthorized':
      return 'unauthorized';
    case 'InvalidWire':
      return 'invalid';
    case 'Upstream':
      return 'upstream';
  }
}

/** Sole UI copy builder for pages and hooks. */
export function toAppError(err: unknown, context: string): AppError {
  if (err && typeof err === 'object' && 'kind' in err && 'userMessage' in err) {
    return err as AppError;
  }

  if (err instanceof TransportError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') {
      return {
        kind: 'unauthorized',
        userMessage: FIXED.unauthorized,
        debugId: context,
        cause: err,
      };
    }
    if (err.status === 403 || err.code === 'FORBIDDEN') {
      return {
        kind: 'forbidden',
        userMessage: FIXED.forbidden,
        debugId: context,
        cause: err,
      };
    }
    if (err.status === 404 || err.code === 'NOT_FOUND') {
      return {
        kind: 'not_found',
        userMessage: FIXED.not_found,
        debugId: context,
        cause: err,
      };
    }
    if (err.code === 'NETWORK' || err instanceof TypeError) {
      return {
        kind: 'network',
        userMessage: FIXED.network,
        debugId: context,
        cause: err,
      };
    }
    return {
      kind: 'upstream',
      userMessage: FIXED.upstream,
      debugId: context,
      cause: err,
    };
  }

  if (err instanceof TypeError) {
    return {
      kind: 'network',
      userMessage: FIXED.network,
      debugId: context,
      cause: err,
    };
  }

  if (
    err &&
    typeof err === 'object' &&
    'failure' in err &&
    typeof (err as { failure: unknown }).failure === 'string'
  ) {
    const failure = (err as { failure: AdapterFailure }).failure;
    const kind = adapterFailureToKind(failure);
    return {
      kind,
      userMessage: FIXED[kind === 'safe' ? 'unknown' : kind],
      debugId: context,
      cause: err,
    };
  }

  return { kind: 'unknown', userMessage: FIXED.unknown, debugId: context, cause: err };
}

export function safeAppError(
  userMessage: string,
  context: string,
  cause?: unknown,
): AppError {
  return { kind: 'safe', userMessage, debugId: context, cause };
}
