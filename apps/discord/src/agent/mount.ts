import { ChannelType, type Client, type Message } from 'discord.js';
import type { BotConfig } from '../config.js';
import type { GatewayState } from '../health.js';
import { logger } from '../log.js';
import { createAgentApi } from './api.js';
import { createHttp } from '../api/http.js';
import { OUTCOME_TEXT, runQuestion, sleep } from './broker.js';
import { normalizeMention } from './normalize.js';
import { collectReplyHistory, fetchDirectReplyToBot } from './reply-context.js';
import { replyTo } from './reply.js';
import {
  DuplicateRequestError,
  AgentQueue,
  QueueFullError,
  RateLimitedError,
} from './queue.js';
import { renderQuestionResult } from './render.js';

const TYPING_REFRESH_MS = 8_000;
const COMPLETED_JOB_LIMIT = 1_000;

interface PendingQuestion {
  message: Message;
  sourceMessageId: string;
  typingTimer: ReturnType<typeof setInterval> | undefined;
}

export interface MountedAgent {
  close(): Promise<void>;
}

function locallyAllowed(config: BotConfig, message: Message): boolean {
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

export async function mountAgent(
  client: Client,
  config: BotConfig,
  gateway?: GatewayState,
): Promise<MountedAgent> {
  if (!config.agentEnabled) {
    logger.info('Agent disabled (AGENT_ENABLED is not "true")');
    return { close: async () => undefined };
  }

  const api = createAgentApi(
    createHttp({
      apiUrl: config.apiUrl,
      secret: config.ingestSecret,
    }),
  );
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
      if (!stopping) {
        void replyTo(item.message, OUTCOME_TEXT.rejected, 'shutdown');
      }
    }
    pending.clear();
  };

  const handleMessage = async (message: Message): Promise<void> => {
    if (!client.user || !locallyAllowed(config, message)) return;
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
      await replyTo(message, outcome.text, outcome.kind);
      return;
    }

    try {
      publisherQueue.reserve(outcome.authorId, outcome.guildId);
    } catch (error: unknown) {
      if (error instanceof RateLimitedError) {
        if (publisherQueue.takeRateLimitNotice(outcome.authorId)) {
          const delivered = await replyTo(
            message,
            OUTCOME_TEXT.rate_limited,
            'rate_limited',
          );
          if (!delivered) publisherQueue.releaseRateLimitNotice(outcome.authorId);
        } else {
          logger.info('Agent rate-limit notice suppressed', {
            authorId: outcome.authorId,
            sourceMessageId: outcome.sourceMessageId,
          });
        }
        return;
      }
      throw error;
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
      const published = publisherQueue.enqueue(outcome.sourceMessageId, async () => {
        const questionOutcome = await runQuestion(job, api, {
          signal: abortController.signal,
          now: Date.now,
          sleep,
          publicOrigin: config.agentPublicOrigin,
        });
        if (stopping) return;
        const live = pending.get(job.job_id);
        if (!live || completed.has(job.job_id)) {
          logger.warn('Ignoring Agent result without a live Discord destination', {
            jobId: job.job_id,
            state: completed.has(job.job_id) ? 'completed' : 'unknown',
          });
          return;
        }
        if (questionOutcome.kind === 'aborted') {
          forget(job.job_id);
          return;
        }
        const content =
          questionOutcome.kind === 'answered' || questionOutcome.kind === 'agent_failed'
            ? renderQuestionResult(questionOutcome.result)
            : OUTCOME_TEXT[questionOutcome.kind];
        const delivered = await replyTo(live.message, content, questionOutcome.kind);
        if (delivered) {
          rememberCompleted(job.job_id);
          logger.info('Agent result delivered', {
            jobId: job.job_id,
            sourceMessageId: live.sourceMessageId,
            outcome: questionOutcome.kind,
          });
        }
        forget(job.job_id);
      });
      void published.catch((error: unknown) => {
        forget(outcome.job.job_id);
        if (stopping) return;
        logger.warn('Agent request failed', {
          jobId: outcome.job.job_id,
          sourceMessageId: outcome.sourceMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
        void replyTo(message, OUTCOME_TEXT.rejected, 'handler_error');
      });
    } catch (error: unknown) {
      forget(outcome.job.job_id);
      if (error instanceof DuplicateRequestError) {
        await replyTo(message, OUTCOME_TEXT.duplicate, 'duplicate');
        return;
      }
      if (error instanceof QueueFullError) {
        await replyTo(message, OUTCOME_TEXT.queue_full, 'queue_full');
        return;
      }
      await replyTo(message, OUTCOME_TEXT.rejected, 'handler_error');
    }
  };
  client.on('messageCreate', (message: Message) => {
    void handleMessage(message).catch((error: unknown) => {
      logger.error('Agent request handling failed', {
        sourceMessageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      void replyTo(message, OUTCOME_TEXT.rejected, 'handler_error');
    });
  });
  gateway?.subscribe((event) => {
    if (event.type === 'disconnected') {
      for (const jobId of pending.keys()) stopTyping(jobId);
    }
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
