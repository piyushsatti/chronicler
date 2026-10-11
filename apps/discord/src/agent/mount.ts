import { ChannelType, Events, type Client, type Message } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../log.js';
import { submitQuestion } from './broker.js';
import { normalizeMention } from './normalize.js';
import { collectReplyHistory, fetchDirectReplyToBot } from './reply-context.js';
import {
  DuplicateRequestError,
  AgentQueue,
  QueueFullError,
  RateLimitedError,
} from './queue.js';
import { renderQuestionResult } from './render.js';
import type { QuestionResult } from './types.js';

const TYPING_REFRESH_MS = 8_000;
const FAILURE_TEXT = "I couldn't finish this request. Please try again.";
const COMPLETED_JOB_LIMIT = 1_000;

interface PendingQuestion {
  message: Message;
  sourceMessageId: string;
  typingTimer: ReturnType<typeof setInterval> | undefined;
}

export interface MountedAgent {
  close(): Promise<void>;
}

function locallyAllowed(message: Message): boolean {
  if (message.guildId === null) {
    return (
      message.channel.type === ChannelType.DM &&
      config.agentAllowedDmUserIds.has(message.author.id)
    );
  }
  if (!config.agentAllowedGuildIds.has(message.guildId)) return false;
  if (config.agentAllowedChannelIds.has(message.channelId)) return true;
  return (
    message.channel.isThread() &&
    message.channel.parentId !== null &&
    config.agentAllowedChannelIds.has(message.channel.parentId)
  );
}

function reply(message: Message, content: string): Promise<unknown> {
  return message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false },
  });
}

export async function mountAgent(client: Client): Promise<MountedAgent> {
  if (!config.agentEnabled) {
    logger.info('Agent disabled (AGENT_ENABLED is not "true")');
    return { close: async () => undefined };
  }

  const publisherQueue = new AgentQueue(
    config.agentMaxConcurrent,
    config.agentQueueCapacity,
  );
  const pending = new Map<string, PendingQuestion>();
  const completed = new Set<string>();
  const abortController = new AbortController();
  let stopping = false;

  const stopTyping = (jobId: string): void => {
    const item = pending.get(jobId);
    if (item?.typingTimer !== undefined) clearInterval(item.typingTimer);
    if (item) item.typingTimer = undefined;
  };
  const forget = (jobId: string): void => {
    stopTyping(jobId);
    pending.delete(jobId);
  };
  const rememberCompleted = (jobId: string): void => {
    completed.add(jobId);
    const oldest = completed.values().next().value as string | undefined;
    if (completed.size > COMPLETED_JOB_LIMIT && oldest) completed.delete(oldest);
  };
  const failPending = (): void => {
    for (const [jobId, item] of pending) {
      stopTyping(jobId);
      if (!stopping) void reply(item.message, FAILURE_TEXT).catch(() => undefined);
    }
    pending.clear();
  };
  const handleResult = async (result: QuestionResult): Promise<void> => {
    if (stopping) return;
    const item = pending.get(result.job_id);
    if (!item || completed.has(result.job_id)) {
      logger.warn('Ignoring Agent result without a live Discord destination', {
        jobId: result.job_id,
        state: completed.has(result.job_id) ? 'completed' : 'unknown',
      });
      return;
    }
    await reply(item.message, renderQuestionResult(result));
    rememberCompleted(result.job_id);
    forget(result.job_id);
    logger.info('Agent result delivered', {
      jobId: result.job_id,
      sourceMessageId: item.sourceMessageId,
      resultType: result.type,
    });
  };

  const handleMessage = async (message: Message): Promise<void> => {
    if (!client.user || !locallyAllowed(message)) return;
    const mentioned = message.mentions.users.has(client.user.id);
    const directParent =
      mentioned || message.author.bot || message.webhookId !== null
        ? undefined
        : await fetchDirectReplyToBot(message, client.user.id);
    const outcome = normalizeMention(
      message,
      client.user.id,
      directParent !== undefined,
    );
    if (outcome.kind === 'ignore') return;
    if (outcome.kind === 'usage' || outcome.kind === 'reject') {
      void reply(message, outcome.text).catch(() => undefined);
      return;
    }
    if (pending.has(outcome.job.job_id)) {
      void reply(message, 'That question is already being handled.').catch(
        () => undefined,
      );
      return;
    }
    const sendTyping = (): void => {
      if (message.channel.type !== ChannelType.GroupDM)
        void message.channel.sendTyping().catch(() => undefined);
    };
    sendTyping();
    const history = await collectReplyHistory(message, client.user.id, directParent);
    const job = history ? { ...outcome.job, history } : outcome.job;
    const item: PendingQuestion = {
      message,
      sourceMessageId: outcome.sourceMessageId,
      typingTimer: setInterval(sendTyping, TYPING_REFRESH_MS),
    };
    pending.set(outcome.job.job_id, item);
    try {
      const published = publisherQueue.enqueue(
        outcome.sourceMessageId,
        outcome.authorId,
        outcome.guildId,
        async () => {
          const result = await submitQuestion(job, abortController.signal);
          await handleResult(result);
        },
      );
      void published.catch((error: unknown) => {
        forget(outcome.job.job_id);
        if (stopping) return;
        logger.warn('Agent request publish failed', {
          jobId: outcome.job.job_id,
          sourceMessageId: outcome.sourceMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
        void reply(message, FAILURE_TEXT).catch(() => undefined);
      });
    } catch (error: unknown) {
      forget(outcome.job.job_id);
      const content =
        error instanceof RateLimitedError
          ? 'Please wait before asking another question.'
          : error instanceof DuplicateRequestError
            ? 'That question is already being handled.'
            : error instanceof QueueFullError
              ? 'I am at capacity right now. Please try again shortly.'
              : FAILURE_TEXT;
      void reply(message, content).catch(() => undefined);
    }
  };
  client.on('messageCreate', (message: Message) => {
    void handleMessage(message).catch((error: unknown) => {
      logger.error('Agent request handling failed', {
        sourceMessageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      void reply(message, FAILURE_TEXT).catch(() => undefined);
    });
  });
  client.on(Events.ShardDisconnect, () => {
    for (const jobId of pending.keys()) stopTyping(jobId);
  });
  logger.info('Agent mentions mounted against the API');

  return {
    async close(): Promise<void> {
      stopping = true;
      abortController.abort();
      failPending();
    },
  };
}
