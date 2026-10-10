import { describe, expect, it } from 'vitest';
import { renderQuestionResult } from '@discord/agent/render.js';

describe('renderQuestionResult', () => {
  it('renders no more than three sources within the message cap', () => {
    const rendered = renderQuestionResult({
      version: 1,
      type: 'question.completed',
      job_id: 'job',
      answer: 'A grounded answer.',
      sources: [1, 2, 3, 4].map((n) => ({
        document_id: String(n),
        title: `Source ${n}`,
        url: `https://example.test/${n}`,
      })),
    });
    expect(rendered).toContain('Source 3');
    expect(rendered).not.toContain('Source 4');
    expect(rendered.length).toBeLessThanOrEqual(1900);
  });

  it('escapes hostile source titles and renders visible failure text', () => {
    const rendered = renderQuestionResult({
      version: 1,
      type: 'question.completed',
      job_id: 'job',
      answer: 'Review the source.',
      sources: [
        {
          document_id: '1',
          title: '[evil](https://evil.example) @everyone\n',
          url: 'https://chronicler.example/rules/guides/safe',
        },
      ],
    });
    expect(rendered).not.toContain('[evil](https://evil.example)');
    expect(rendered).not.toContain('@everyone');
    expect(
      renderQuestionResult({
        version: 1,
        type: 'question.failed',
        job_id: 'job',
        message: 'Please try again.',
      }),
    ).toBe('Please try again.');
  });
});
