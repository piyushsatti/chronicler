import { randomUUID } from 'node:crypto';
import type { Message } from 'discord.js';
import type { NormalizedMention } from './types.js';

export type MentionOutcome =
  | { kind: 'ignore' }
  | { kind: 'usage'; text: string }
  | { kind: 'reject'; text: string }
  | ({ kind: 'accepted' } & NormalizedMention);

const MAX_QUESTION_CHARS = 600;

export function normalizeMention(
  message: Message,
  botId: string,
  isDirectReplyToBot = false,
): MentionOutcome {
  if (
    message.author.bot ||
    message.webhookId !== null ||
    (!message.mentions.users.has(botId) && !isDirectReplyToBot)
  ) {
    return { kind: 'ignore' };
  }

  const mention = new RegExp(`<@!?${botId}>`, 'g');
  const question = message.content.replace(mention, ' ').replace(/\s+/g, ' ').trim();
  if (question === '') {
    return {
      kind: 'usage',
      text: 'Mention me with a question about public Chronicler rules or codex entries.',
    };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return {
      kind: 'reject',
      text: `Please keep the question to ${MAX_QUESTION_CHARS} characters or fewer.`,
    };
  }

  const jobId = randomUUID();
  return {
    kind: 'accepted',
    job: {
      version: 1,
      type: 'question.requested',
      job_id: jobId,
      question,
    },
    sourceMessageId: message.id,
    authorId: message.author.id,
    guildId: message.guildId ?? 'dm',
  };
}
