import { createAgentApi, type AgentPort } from './api.js';
import { createHttp, type FetchFn } from '../api/http.js';
import type { BotConfig } from '../config.js';
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

export const WAIT_MS = 120_000;
const POLL_MS = 1_000;

export type Clock = () => number;
export type SleepFn = (ms: number, signal: AbortSignal) => Promise<void>;

export type QuestionOutcome =
  | { kind: 'answered' | 'agent_failed'; result: QuestionResult }
  | { kind: 'rejected'; status?: number }
  | { kind: 'timed_out' }
  | { kind: 'aborted' }
  | { kind: 'invalid_result'; reason: string };

const FAILURE_TEXT = "I couldn't finish this request. Please try again.";

export const OUTCOME_TEXT = {
  rejected: FAILURE_TEXT,
  timed_out: FAILURE_TEXT,
  aborted: FAILURE_TEXT,
  invalid_result: FAILURE_TEXT,
  rate_limited: 'Please wait before asking another question.',
  queue_full: 'I am at capacity right now. Please try again shortly.',
  duplicate: 'That question is already being handled.',
} as const;

export type AgentApiDeps = {
  agent?: AgentPort;
  fetch?: FetchFn;
};

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function agentFor(config: BotConfig, deps?: AgentApiDeps): AgentPort {
  if (deps?.agent) return deps.agent;
  return createAgentApi(
    createHttp({
      apiUrl: config.apiUrl,
      secret: config.ingestSecret,
      fetch: deps?.fetch,
    }),
  );
}

function isFailFast(status: number | undefined): boolean {
  return status === 401 || status === 403 || status === 404;
}

function abortedOutcome(): QuestionOutcome {
  return { kind: 'aborted' };
}

/** POST a question, then poll until completed, failed, or a terminal outcome. */
export async function runQuestion(
  job: QuestionRequest,
  api: AgentPort,
  o: {
    signal: AbortSignal;
    now: Clock;
    sleep: SleepFn;
    publicOrigin: string;
  },
): Promise<QuestionOutcome> {
  const deadline = o.now() + WAIT_MS;

  for (;;) {
    if (o.signal.aborted) return abortedOutcome();
    if (o.now() > deadline) return { kind: 'timed_out' };

    let created;
    try {
      created = await api.submit(job, o.signal);
    } catch (error: unknown) {
      if (o.signal.aborted) return abortedOutcome();
      throw error;
    }
    if (created.ok) break;
    if (o.signal.aborted) return abortedOutcome();
    if (isFailFast(created.status) || created.kind === 'permanent') {
      return { kind: 'rejected', status: created.status };
    }
    if (o.now() > deadline) return { kind: 'timed_out' };
    try {
      await o.sleep(created.retryAfterMs ?? POLL_MS, o.signal);
    } catch {
      return abortedOutcome();
    }
  }

  for (;;) {
    if (o.signal.aborted) return abortedOutcome();
    if (o.now() > deadline) return { kind: 'timed_out' };

    let response;
    try {
      response = await api.poll(job.job_id, o.signal);
    } catch (error: unknown) {
      if (o.signal.aborted) return abortedOutcome();
      throw error;
    }
    if (!response.ok) {
      if (o.signal.aborted) return abortedOutcome();
      if (
        response.status !== undefined &&
        response.status >= 200 &&
        response.status < 300
      ) {
        return { kind: 'invalid_result', reason: response.detail };
      }
      if (isFailFast(response.status) || response.kind === 'permanent') {
        return { kind: 'rejected', status: response.status };
      }
      if (o.now() > deadline) return { kind: 'timed_out' };
      try {
        await o.sleep(response.retryAfterMs ?? POLL_MS, o.signal);
      } catch {
        return abortedOutcome();
      }
      continue;
    }
    if (response.status === 202 || response.status === 204) {
      try {
        await o.sleep(POLL_MS, o.signal);
      } catch {
        return abortedOutcome();
      }
      continue;
    }
    try {
      const result = parseQuestionResult(
        Buffer.from(response.text),
        job.job_id,
        o.publicOrigin,
      );
      return {
        kind: result.type === 'question.completed' ? 'answered' : 'agent_failed',
        result,
      };
    } catch (error: unknown) {
      return {
        kind: 'invalid_result',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/** Compatibility wrapper: throws on non-result outcomes for older callers. */
export async function submitQuestion(
  config: BotConfig,
  job: QuestionRequest,
  signal?: AbortSignal,
  deps?: AgentApiDeps,
): Promise<QuestionResult> {
  const controller = signal ?? new AbortController().signal;
  const outcome = await runQuestion(job, agentFor(config, deps), {
    signal: controller,
    now: Date.now,
    sleep,
    publicOrigin: config.agentPublicOrigin,
  });
  switch (outcome.kind) {
    case 'answered':
    case 'agent_failed':
      return outcome.result;
    case 'aborted':
      throw controller.reason instanceof Error
        ? controller.reason
        : new Error('Aborted');
    case 'timed_out':
      throw new Error('agent question timed out');
    case 'invalid_result':
      throw new Error(outcome.reason);
    case 'rejected':
      throw new Error(
        outcome.status === undefined
          ? 'agent question rejected'
          : `agent question status ${outcome.status}`,
      );
  }
}
