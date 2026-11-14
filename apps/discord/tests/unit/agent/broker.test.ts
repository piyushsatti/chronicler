import { describe, expect, it } from 'vitest';
import { parseQuestionResult } from '@discord/agent/broker.js';
import { renderQuestionResult } from '@discord/agent/render.js';
import { completedQuestion, jobId, publicOrigin } from '../../fixtures/api.js';

describe('parseQuestionResult', () => {
  it('accepts a correlated completion with canonical links', () => {
    const result = parseQuestionResult(
      Buffer.from(JSON.stringify(completedQuestion())),
      jobId,
      publicOrigin,
    );
    expect(result.type).toBe('question.completed');
  });

  it('drops untrusted links and keeps the answer; still rejects correlation mismatch', () => {
    const body = Buffer.from(
      JSON.stringify({
        version: 1,
        type: 'question.completed',
        job_id: jobId,
        answer: 'Claim',
        sources: [
          {
            document_id: 'document-1',
            title: 'Hostile',
            url: 'https://evil.example/rules/guides/rules',
          },
        ],
      }),
    );
    const result = parseQuestionResult(body, jobId, 'https://chronicler.example');
    expect(result).toEqual({
      version: 1,
      type: 'question.completed',
      job_id: jobId,
      answer: 'Claim',
      sources: [],
    });
    expect(renderQuestionResult(result)).toContain('Claim');
    expect(() =>
      parseQuestionResult(
        Buffer.from(
          JSON.stringify({
            version: 1,
            type: 'question.failed',
            job_id: jobId,
            message: 'Try again.',
          }),
        ),
        '00000000-0000-4000-8000-000000000002',
        'https://chronicler.example',
      ),
    ).toThrow('correlation mismatch');
  });

  it('rejects a bad version or type; accepts four sources', () => {
    expect(() =>
      parseQuestionResult(
        Buffer.from(
          JSON.stringify({
            version: 2,
            type: 'question.completed',
            job_id: jobId,
            answer: 'x',
            sources: [],
          }),
        ),
        jobId,
        publicOrigin,
      ),
    ).toThrow('version mismatch');

    expect(() =>
      parseQuestionResult(
        Buffer.from(
          JSON.stringify({
            version: 1,
            type: 'question.unknown',
            job_id: jobId,
          }),
        ),
        jobId,
        publicOrigin,
      ),
    ).toThrow('type mismatch');

    const result = parseQuestionResult(
      Buffer.from(
        JSON.stringify({
          version: 1,
          type: 'question.completed',
          job_id: jobId,
          answer: 'x',
          sources: [
            {
              document_id: 'a',
              title: 'A',
              url: `${publicOrigin}/rules/a`,
            },
            {
              document_id: 'b',
              title: 'B',
              url: `${publicOrigin}/rules/b`,
            },
            {
              document_id: 'c',
              title: 'C',
              url: `${publicOrigin}/rules/c`,
            },
            {
              document_id: 'd',
              title: 'D',
              url: `${publicOrigin}/rules/d`,
            },
          ],
        }),
      ),
      jobId,
      publicOrigin,
    );
    expect(result.type).toBe('question.completed');
    if (result.type === 'question.completed') {
      expect(result.sources).toHaveLength(4);
    }
  });
});
