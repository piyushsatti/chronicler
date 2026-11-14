import { describe, expect, it, vi } from 'vitest';
import type { AgentPort } from '@discord/agent/api.js';
import { runQuestion, WAIT_MS } from '@discord/agent/broker.js';
import { completedQuestion, jobId, publicOrigin, questionRequest } from '../../fixtures/api.js';

describe('runQuestion', () => {
  it('answers after submit ok, poll retryable, poll 202, then poll 200', async () => {
    const submits: unknown[] = [];
    let polls = 0;
    const agent: AgentPort = {
      submit: async (job) => {
        submits.push(job);
        return { ok: true, status: 202, text: '' };
      },
      poll: async () => {
        polls += 1;
        if (polls === 1) {
          return { ok: false, kind: 'retryable', detail: 'connection reset' };
        }
        if (polls === 2) {
          return { ok: true, status: 202, text: '' };
        }
        return {
          ok: true,
          status: 200,
          text: JSON.stringify(completedQuestion('Ready.')),
        };
      },
    };
    const sleeps: number[] = [];
    let now = 1_000;
    const outcome = await runQuestion(questionRequest, agent, {
      signal: new AbortController().signal,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      publicOrigin,
    });
    expect(outcome).toEqual({
      kind: 'answered',
      result: expect.objectContaining({
        type: 'question.completed',
        answer: 'Ready.',
        job_id: jobId,
      }),
    });
    expect(submits).toEqual([questionRequest]);
    expect(polls).toBe(3);
    expect(sleeps.length).toBe(2);
  });

  it('fails fast on poll 404', async () => {
    const agent: AgentPort = {
      submit: async () => ({ ok: true, status: 202, text: '' }),
      poll: async () => ({
        ok: false,
        kind: 'permanent',
        status: 404,
        detail: 'missing',
      }),
    };
    const sleep = vi.fn(async () => undefined);
    const outcome = await runQuestion(questionRequest, agent, {
      signal: new AbortController().signal,
      now: () => 1_000,
      sleep,
      publicOrigin,
    });
    expect(outcome).toEqual({ kind: 'rejected', status: 404 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries submit with the same job_id and body object', async () => {
    const bodies: unknown[] = [];
    let submits = 0;
    const agent: AgentPort = {
      submit: async (job) => {
        submits += 1;
        bodies.push(job);
        if (submits === 1) {
          return { ok: false, kind: 'retryable', detail: 'fetch failed' };
        }
        return { ok: true, status: 202, text: '' };
      },
      poll: async () => ({
        ok: true,
        status: 200,
        text: JSON.stringify(completedQuestion()),
      }),
    };
    const outcome = await runQuestion(questionRequest, agent, {
      signal: new AbortController().signal,
      now: () => 1_000,
      sleep: async () => undefined,
      publicOrigin,
    });
    expect(outcome.kind).toBe('answered');
    expect(submits).toBe(2);
    expect(bodies[0]).toBe(questionRequest);
    expect(bodies[1]).toBe(questionRequest);
    expect(bodies[0]).toEqual(bodies[1]);
  });

  it('times out when the deadline passes during polling', async () => {
    let now = 1_000;
    const agent: AgentPort = {
      submit: async () => ({ ok: true, status: 202, text: '' }),
      poll: async () => ({ ok: true, status: 202, text: '' }),
    };
    const outcome = await runQuestion(questionRequest, agent, {
      signal: new AbortController().signal,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
        if (now > 1_000 + WAIT_MS) now = 1_000 + WAIT_MS + 1;
      },
      publicOrigin,
    });
    expect(outcome).toEqual({ kind: 'timed_out' });
  });

  it('maps abort thrown mid-poll to an aborted outcome', async () => {
    const controller = new AbortController();
    const agent: AgentPort = {
      submit: async () => ({ ok: true, status: 202, text: '' }),
      poll: async () => {
        controller.abort();
        throw new Error('Aborted');
      },
    };
    const outcome = await runQuestion(questionRequest, agent, {
      signal: controller.signal,
      now: () => 1_000,
      sleep: async () => undefined,
      publicOrigin,
    });
    expect(outcome).toEqual({ kind: 'aborted' });
  });
});
