export type AdapterFailure = 'NotFound' | 'InvalidWire' | 'Unauthorized' | 'Upstream';

export type AdapterResult<T> =
  { ok: true; data: T } | { ok: false; failure: AdapterFailure; detail?: string };

export type AppErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'upstream'
  | 'safe'
  | 'unknown';

export type AppError = {
  kind: AppErrorKind;
  userMessage: string;
  debugId?: string;
  cause?: unknown;
};

export class TransportError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, options?: { status?: number; cause?: unknown }) {
    super(`transport:${code}`);
    this.name = 'TransportError';
    this.code = code;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}
