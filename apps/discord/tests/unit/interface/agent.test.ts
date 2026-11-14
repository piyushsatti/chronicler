/**
 * agent-qa-http: Discord question shapes match packages/contracts/openapi.yaml.
 *
 * Length checks use JS UTF-16 units; the API counts Unicode runes. At these
 * contract sizes the two agree for BMP text.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MessageReferenceType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { WAIT_MS, parseQuestionResult } from '@discord/agent/broker.js';
import { normalizeMention } from '@discord/agent/normalize.js';
import {
  MAX_REPLY_HISTORY_MESSAGES,
  collectReplyHistory,
} from '@discord/agent/reply-context.js';
import { jobId, publicOrigin } from '../../fixtures/api.js';
import {
  readObjectSchema,
  readQuestionDeadlineSeconds,
  schemaViolations,
} from '../../support/openapi.js';

const openApiPath = fileURLToPath(
  new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
);

interface FakeMessage {
  id: string;
  channelId: string;
  guildId: string | null;
  content: string;
  author: { id: string; bot: boolean };
  webhookId: null;
  mentions: { users: { has: (id: string) => boolean } };
  reference: {
    type: MessageReferenceType;
    messageId: string;
    channelId: string;
    guildId: string | null;
  } | null;
  fetchReference: ReturnType<typeof vi.fn>;
}

function historyMessage(
  id: string,
  content: string,
  options: { authorId?: string; parent?: FakeMessage } = {},
): FakeMessage {
  const channelId = 'chan-1';
  const guildId = 'guild-1';
  return {
    id,
    channelId,
    guildId,
    content,
    author: { id: options.authorId ?? 'user-1', bot: options.authorId === 'bot' },
    webhookId: null,
    mentions: { users: { has: (id: string) => id === 'bot' } },
    reference: options.parent
      ? {
          type: MessageReferenceType.Default,
          messageId: options.parent.id,
          channelId,
          guildId,
        }
      : null,
    fetchReference: options.parent
      ? vi.fn().mockResolvedValue(options.parent)
      : vi.fn(),
  };
}

describe('discord-agent contract', () => {
  const yaml = readFileSync(openApiPath, 'utf8');
  const requested = readObjectSchema(yaml, 'QuestionRequested');
  const resultSchema = readObjectSchema(yaml, 'QuestionResult');

  it('bot question and history bounds match the schema', () => {
    expect(requested.properties.question?.maxLength).toBe(600);
    expect(requested.properties.history?.properties?.messages?.maxItems).toBe(12);
    expect(MAX_REPLY_HISTORY_MESSAGES).toBe(
      requested.properties.history?.properties?.messages?.maxItems,
    );
  });

  it('a bounded mention plus reply history matches QuestionRequested', async () => {
    const questionMax = requested.properties.question?.maxLength ?? 0;
    let parent = historyMessage('m0', 'seed question');
    for (let i = 1; i < MAX_REPLY_HISTORY_MESSAGES; i += 1) {
      parent = historyMessage(`m${i}`, `turn ${i}`, {
        authorId: i % 2 === 0 ? 'user-1' : 'bot',
        parent,
      });
    }
    const mention = historyMessage(
      'current',
      `<@bot> ${'q'.repeat(questionMax)}`,
      { parent },
    );
    const outcome = normalizeMention(mention as never, 'bot');
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') return;

    const history = await collectReplyHistory(mention as never, 'bot');
    const body = { ...outcome.job, history };
    expect(schemaViolations(requested, body)).toEqual([]);
    expect(history?.messages).toHaveLength(MAX_REPLY_HISTORY_MESSAGES);
  });

  it('accepts a result at each contract maximum and sources null', () => {
    const answerMax = resultSchema.properties.answer?.maxLength ?? 0;
    const sourcesMax = resultSchema.properties.sources?.maxItems ?? 0;
    const messageMax = resultSchema.properties.message?.maxLength ?? 0;
    expect(answerMax).toBe(16_000);
    expect(sourcesMax).toBe(100);
    expect(messageMax).toBe(1_000);
    expect(resultSchema.properties.sources?.type).toEqual(['array', 'null']);

    const completed = parseQuestionResult(
      Buffer.from(
        JSON.stringify({
          version: 1,
          type: 'question.completed',
          job_id: jobId,
          answer: 'a'.repeat(answerMax),
          sources: Array.from({ length: sourcesMax }, (_, i) => ({
            document_id: `doc-${i}`,
            title: `Title ${i}`,
            url: `${publicOrigin}/rules/${i}`,
          })),
        }),
      ),
      jobId,
      publicOrigin,
    );
    expect(completed.type).toBe('question.completed');
    if (completed.type === 'question.completed') {
      expect(completed.answer).toHaveLength(answerMax);
      expect(completed.sources).toHaveLength(sourcesMax);
    }

    const withNullSources = parseQuestionResult(
      Buffer.from(
        JSON.stringify({
          version: 1,
          type: 'question.completed',
          job_id: jobId,
          answer: 'ok',
          sources: null,
        }),
      ),
      jobId,
      publicOrigin,
    );
    expect(withNullSources).toMatchObject({
      type: 'question.completed',
      answer: 'ok',
      sources: [],
    });

    const failed = parseQuestionResult(
      Buffer.from(
        JSON.stringify({
          version: 1,
          type: 'question.failed',
          job_id: jobId,
          message: 'm'.repeat(messageMax),
        }),
      ),
      jobId,
      publicOrigin,
    );
    expect(failed.type).toBe('question.failed');
    if (failed.type === 'question.failed') {
      expect(failed.message).toHaveLength(messageMax);
    }
  });

  it('WAIT_MS outlasts the contract question deadline', () => {
    const deadlineSeconds = readQuestionDeadlineSeconds(yaml);
    expect(WAIT_MS).toBeGreaterThan(deadlineSeconds * 1_000);
  });
});
