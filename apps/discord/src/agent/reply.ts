import type { Message } from 'discord.js';
import { logger } from '../log.js';

export type ReplyReason =
  | 'answered'
  | 'agent_failed'
  | 'rejected'
  | 'timed_out'
  | 'aborted'
  | 'invalid_result'
  | 'rate_limited'
  | 'queue_full'
  | 'duplicate'
  | 'usage'
  | 'reject'
  | 'shutdown'
  | 'handler_error';

function discordErrorCode(error: unknown): number | string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'number' || typeof code === 'string') return code;
  }
  return undefined;
}

/** Sole Discord write path for agent replies. Returns false when delivery fails. */
export async function replyTo(
  message: Message,
  content: string,
  reason: ReplyReason,
): Promise<boolean> {
  try {
    await message.reply({
      content,
      allowedMentions: { parse: [], repliedUser: false },
    });
    return true;
  } catch (error: unknown) {
    logger.warn('Agent reply delivery failed', {
      reason,
      sourceMessageId: message.id,
      code: discordErrorCode(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
