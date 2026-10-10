import { describe, expect, it } from 'vitest';
import { parseQuestionResult } from '@discord/agent/broker.js';
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

  it('rejects correlation mismatches and untrusted links', () => {
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
    expect(() =>
      parseQuestionResult(body, jobId, 'https://chronicler.example'),
    ).toThrow('untrusted URL');
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

  it('rejects a bad version, bad type, and too many sources', () => {
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

    expect(() =>
      parseQuestionResult(
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
      ),
    ).toThrow('sources mismatch');
  });
});
