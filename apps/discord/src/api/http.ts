export type ApiFailure = {
  kind: 'retryable' | 'permanent';
  status?: number;
  detail: string;
  retryAfterMs?: number;
};

export type ApiResponse =
  | { ok: true; status: number; text: string }
  | ({ ok: false } & ApiFailure);

export type HttpRequest = {
  method: string;
  path: string;
  body?: string;
  signal?: AbortSignal;
  maxBytes?: number;
};

export type HttpPort = {
  request(req: HttpRequest): Promise<ApiResponse>;
};

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_AFTER_CAP_MS = 300_000;

export function callSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (signal === undefined) return timeout;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeout]);
  }
  return signal.aborted ? signal : timeout;
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === 'TimeoutError';
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const secs = Number(header);
  if (!Number.isFinite(secs) || secs <= 0) return undefined;
  return Math.min(Math.ceil(secs * 1000), RETRY_AFTER_CAP_MS);
}

function classifyStatus(status: number, detail: string, retryAfter: string | null): ApiFailure {
  if (status === 408 || status === 429 || status >= 500) {
    const failure: ApiFailure = { kind: 'retryable', status, detail };
    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(retryAfter);
      if (retryAfterMs !== undefined) failure.retryAfterMs = retryAfterMs;
    }
    return failure;
  }
  return { kind: 'permanent', status, detail };
}

async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  if (response.body === null) {
    return { ok: true, text: '' };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, detail: `response exceeded ${maxBytes} bytes` };
    }
    chunks.push(value);
  }
  let length = 0;
  for (const chunk of chunks) length += chunk.byteLength;
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder('utf8').decode(merged) };
}

export function createHttp(o: {
  apiUrl: string;
  secret: string;
  timeoutMs?: number;
  fetch?: FetchFn;
}): HttpPort {
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetch = o.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async request(req: HttpRequest): Promise<ApiResponse> {
      const headers: Record<string, string> = {
        'X-Ingest-Secret': o.secret,
      };
      if (req.body !== undefined) {
        headers['content-type'] = 'application/json';
      }

      let response: Response;
      try {
        response = await fetch(`${o.apiUrl}${req.path}`, {
          method: req.method,
          headers,
          body: req.body,
          signal: callSignal(req.signal, timeoutMs),
        });
      } catch (err: unknown) {
        if (req.signal?.aborted) {
          throw err instanceof Error ? err : new Error(String(err));
        }
        const detail = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          kind: 'retryable',
          detail: isTimeoutError(err) ? `timeout: ${detail}` : detail,
        };
      }

      let text: string;
      if (req.maxBytes !== undefined) {
        const body = await readBodyCapped(response, req.maxBytes);
        if (!body.ok) {
          return {
            ok: false,
            ...classifyStatus(
              response.status,
              body.detail,
              response.headers.get('Retry-After'),
            ),
          };
        }
        text = body.text;
      } else {
        text = await response.text().catch(() => '');
      }

      if (response.status >= 200 && response.status < 300) {
        return { ok: true, status: response.status, text };
      }

      return {
        ok: false,
        ...classifyStatus(
          response.status,
          text || response.statusText,
          response.headers.get('Retry-After'),
        ),
      };
    },
  };
}
