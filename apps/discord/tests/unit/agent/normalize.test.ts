import { describe, expect, it } from 'vitest';
import { normalizeMention } from '@discord/agent/normalize.js';

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: '111',
    channelId: '222',
    guildId: '333',
    webhookId: null,
    author: { id: '444', bot: false },
    content: '<@999> How does a grapple end?',
    mentions: { users: { has: (id: string) => id === '999' } },
    channel: { isThread: () => false, parentId: null },
    ...overrides,
  };
}

describe('normalizeMention', () => {
  it('publishes only the agreed request contract', () => {
    const result = normalizeMention(message() as never, '999');
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.job).toEqual({
        version: 1,
        type: 'question.requested',
        job_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        question: 'How does a grapple end?',
      });
      expect(result.sourceMessageId).toBe('111');
    }
  });

  it('keeps Discord destination and author data outside the job', () => {
    const result = normalizeMention(message({ guildId: null }) as never, '999');
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.guildId).toBe('dm');
      expect(result.job).not.toHaveProperty('author_id');
      expect(result.job).not.toHaveProperty('channel_id');
      expect(result.job).not.toHaveProperty('source_message_id');
    }
  });

  it('ignores non-mentions and rejects empty or overlong questions', () => {
    expect(
      normalizeMention(
        message({ mentions: { users: { has: () => false } } }) as never,
        '999',
      ).kind,
    ).toBe('ignore');
    expect(normalizeMention(message({ content: '<@!999>' }) as never, '999').kind).toBe(
      'usage',
    );
    expect(
      normalizeMention(
        message({ content: `<@999> ${'x'.repeat(601)}` }) as never,
        '999',
      ).kind,
    ).toBe('reject');
  });

  it('accepts an unmentioned question only after a direct bot reply is verified', () => {
    const reply = message({
      content: 'What if I am a fighter?',
      mentions: { users: { has: () => false } },
    });

    expect(normalizeMention(reply as never, '999').kind).toBe('ignore');
    const result = normalizeMention(reply as never, '999', true);
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.job.question).toBe('What if I am a fighter?');
    }
  });
});
