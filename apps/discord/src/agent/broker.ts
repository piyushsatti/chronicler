import { config } from '../config.js';
import type { QuestionRequest, QuestionResult, QuestionSource } from './types.js';

const MAX_RESULT_BYTES = 64 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new Error('Agent result schema mismatch');
  }
  return value;
}

export function parseQuestionResult(
  body: Buffer,
  correlationId: string | undefined,
  publicOrigin: string,
): QuestionResult {
  if (body.byteLength > MAX_RESULT_BYTES)
    throw new Error('Agent result exceeded the byte limit');
  const decoded: unknown = JSON.parse(body.toString('utf8'));
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded))
    throw new Error('Agent result schema mismatch');
  const raw = decoded as Record<string, unknown>;
  if (raw['version'] !== 1) throw new Error('Agent result version mismatch');
  const jobId = boundedString(raw['job_id'], 36);
  if (!UUID_RE.test(jobId) || correlationId !== jobId)
    throw new Error('Agent result correlation mismatch');
  if (raw['type'] === 'question.failed') {
    return {
      version: 1,
      type: 'question.failed',
      job_id: jobId,
      message: boundedString(raw['message'], 1_000),
    };
  }
  if (raw['type'] !== 'question.completed')
    throw new Error('Agent result type mismatch');
  const rawSources = raw['sources'] ?? [];
  if (!Array.isArray(rawSources) || rawSources.length > 100)
    throw new Error('Agent result sources mismatch');
  const expectedOrigin = new URL(publicOrigin).origin;
  const sources: QuestionSource[] = [];
  for (const item of rawSources) {
    try {
      if (typeof item !== 'object' || item === null || Array.isArray(item))
        throw new Error('Agent result source mismatch');
      const source = item as Record<string, unknown>;
      const url = new URL(boundedString(source['url'], 1_000));
      if (
        url.protocol !== 'https:' ||
        url.origin !== expectedOrigin ||
        (!url.pathname.startsWith('/rules/') && !url.pathname.startsWith('/codex/')) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('Agent result contained an untrusted URL');
      }
      sources.push({
        document_id: boundedString(source['document_id'], 64),
        title: boundedString(source['title'], 300),
        url: url.toString(),
      });
    } catch {
      // Tolerant reader: drop bad sources rather than reject the answer.
    }
  }
  return {
    version: 1,
    type: 'question.completed',
    job_id: jobId,
    answer: boundedString(raw['answer'], 16_000),
    sources,
  };
}

const QUESTIONS_PATH = '/v1/agent/questions';
export const WAIT_MS = 120_000;
const POLL_MS = 1_000;

function callSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(10_000);
  if (signal === undefined) return timeout;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeout]);
  }
  return signal.aborted ? signal : timeout;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** POST a question, then poll until the API returns a completed or failed result. */
export async function submitQuestion(
  job: QuestionRequest,
  signal?: AbortSignal,
): Promise<QuestionResult> {
  const created = await fetch(`${config.apiUrl}${QUESTIONS_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Ingest-Secret': config.ingestSecret,
    },
    body: JSON.stringify(job),
    signal: callSignal(signal),
  });
  if (!created.ok) {
    throw new Error(`agent question rejected: ${created.status}`);
  }

  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
    }
    if (Date.now() > deadline) throw new Error('agent question timed out');
    const response = await fetch(`${config.apiUrl}${QUESTIONS_PATH}/${job.job_id}`, {
      headers: { 'X-Ingest-Secret': config.ingestSecret },
      signal: callSignal(signal),
    });
    if (response.status === 202 || response.status === 204) {
      await sleep(POLL_MS, signal);
      continue;
    }
    if (!response.ok) throw new Error(`agent question status ${response.status}`);
    const body = Buffer.from(await response.text());
    return parseQuestionResult(body, job.job_id, config.agentPublicOrigin);
  }
}
