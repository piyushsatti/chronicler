import { MessageReferenceType, type Message } from 'discord.js';
import type { QuestionHistory, QuestionHistoryMessage } from './types.js';

// Six user/Chronicler exchanges at most. The byte cap keeps the full job below
// the Agent's 16 KiB transport limit without truncating individual messages.
export const MAX_REPLY_HISTORY_MESSAGES = 12;
export const MAX_REPLY_HISTORY_CONTENT_BYTES = 8 * 1024;

function sameScope(candidate: Message, source: Message): boolean {
  return (
    candidate.channelId === source.channelId && candidate.guildId === source.guildId
  );
}

function hasValidReference(source: Message): boolean {
  const reference = source.reference;
  return (
    reference?.type === MessageReferenceType.Default &&
    typeof reference.messageId === 'string' &&
    reference.messageId !== '' &&
    reference.channelId === source.channelId &&
    (reference.guildId === undefined || reference.guildId === source.guildId)
  );
}

async function fetchScopedReference(source: Message): Promise<Message | undefined> {
  if (!hasValidReference(source)) return undefined;

  try {
    const parent = await source.fetchReference();
    return parent.id === source.reference?.messageId && sameScope(parent, source)
      ? parent
      : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve only a direct, explicit reply to this authenticated bot. */
export async function fetchDirectReplyToBot(
  source: Message,
  botId: string,
): Promise<Message | undefined> {
  const parent = await fetchScopedReference(source);
  return parent?.author.id === botId ? parent : undefined;
}

/**
 * Follow only Discord's explicit reply references. Newest ancestors are
 * collected first so the nearest context survives when a bound is reached,
 * then returned in chronological order for the Agent.
 */
export async function collectReplyHistory(
  source: Message,
  botId: string,
  directParent?: Message,
): Promise<QuestionHistory | undefined> {
  if (source.reference?.type !== MessageReferenceType.Default) return undefined;

  const newestFirst: QuestionHistoryMessage[] = [];
  const seen = new Set<string>([source.id]);
  let contentBytes = 0;
  let current = source;
  let prefetchedParent = directParent;
  let incomplete = false;

  while (current.reference?.type === MessageReferenceType.Default) {
    const reference = current.reference;
    if (
      !reference.messageId ||
      reference.channelId !== source.channelId ||
      (reference.guildId !== undefined && reference.guildId !== source.guildId) ||
      seen.has(reference.messageId) ||
      newestFirst.length >= MAX_REPLY_HISTORY_MESSAGES
    ) {
      incomplete = true;
      break;
    }

    const parent = prefetchedParent ?? (await fetchScopedReference(current));
    prefetchedParent = undefined;
    if (!parent) {
      incomplete = true;
      break;
    }
    if (parent.id !== reference.messageId || seen.has(parent.id)) {
      incomplete = true;
      break;
    }

    const content = parent.content.trim();
    const bytes = Buffer.byteLength(content, 'utf8');
    if (content === '' || contentBytes + bytes > MAX_REPLY_HISTORY_CONTENT_BYTES) {
      incomplete = true;
      break;
    }

    seen.add(parent.id);
    contentBytes += bytes;
    newestFirst.push({
      role: parent.author.id === botId ? 'assistant' : 'user',
      content,
    });
    current = parent;
  }

  return { messages: newestFirst.reverse(), incomplete };
}
