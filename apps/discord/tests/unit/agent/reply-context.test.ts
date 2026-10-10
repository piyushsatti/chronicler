import { MessageReferenceType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_REPLY_HISTORY_MESSAGES,
  collectReplyHistory,
  fetchDirectReplyToBot,
} from '@discord/agent/reply-context.js';

interface FakeMessage {
  id: string;
  channelId: string;
  guildId: string | null;
  content: string;
  author: { id: string; bot: boolean };
  reference: {
    type: MessageReferenceType;
    messageId: string;
    channelId: string;
    guildId: string | null | undefined;
  } | null;
  fetchReference: ReturnType<typeof vi.fn>;
}

function message(
  id: string,
  content: string,
  options: {
    authorId?: string;
    authorBot?: boolean;
    channelId?: string;
    guildId?: string | null;
    parent?: FakeMessage;
  } = {},
): FakeMessage {
  const channelId = options.channelId ?? 'allowed-channel';
  const guildId = options.guildId === undefined ? 'allowed-guild' : options.guildId;
  return {
    id,
    channelId,
    guildId,
    content,
    author: {
      id: options.authorId ?? 'user',
      bot: options.authorBot ?? false,
    },
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

describe('collectReplyHistory', () => {
  it('resolves only a scoped direct reply to the authenticated bot', async () => {
    const chronicler = message('answer', 'Chronicler answer', {
      authorId: 'chronicler',
      authorBot: true,
    });
    const reply = message('reply', 'Follow-up', { parent: chronicler });

    await expect(fetchDirectReplyToBot(reply as never, 'chronicler')).resolves.toBe(
      chronicler,
    );

    const crossChannel = message('cross', 'Hidden', {
      authorId: 'chronicler',
      authorBot: true,
      channelId: 'other-channel',
    });
    reply.fetchReference.mockResolvedValue(crossChannel);
    await expect(
      fetchDirectReplyToBot(reply as never, 'chronicler'),
    ).resolves.toBeUndefined();

    reply.fetchReference.mockRejectedValue(new Error('Missing Access'));
    await expect(
      fetchDirectReplyToBot(reply as never, 'chronicler'),
    ).resolves.toBeUndefined();
  });

  it('returns only the explicit reply ancestry in chronological order', async () => {
    const first = message('first', 'How many attacks at level 5?');
    const answer = message('answer', 'It depends on your class.', {
      authorId: 'chronicler',
      authorBot: true,
      parent: first,
    });
    const unrelatedBranch = message('branch', 'What if I am a wizard?', {
      parent: answer,
    });
    const followUp = message('follow-up', '<@chronicler> What if I am a fighter?', {
      parent: answer,
    });
    followUp.reference!.guildId = undefined;

    await expect(collectReplyHistory(followUp as never, 'chronicler')).resolves.toEqual(
      {
        messages: [
          { role: 'user', content: 'How many attacks at level 5?' },
          { role: 'assistant', content: 'It depends on your class.' },
        ],
        incomplete: false,
      },
    );
    expect(unrelatedBranch.fetchReference).not.toHaveBeenCalled();
  });

  it('does not collect ambient context for a fresh non-reply', async () => {
    await expect(
      collectReplyHistory(
        message('fresh', '<@chronicler> Rules?') as never,
        'chronicler',
      ),
    ).resolves.toBeUndefined();
  });

  it('uses the authenticated bot id rather than the author bot flag', async () => {
    const otherBot = message('other', 'Third-party bot text', {
      authorId: 'other-bot',
      authorBot: true,
    });
    const chronicler = message('chronicler-answer', 'Chronicler text', {
      authorId: 'chronicler',
      authorBot: true,
      parent: otherBot,
    });
    const followUp = message('follow-up', 'Question', { parent: chronicler });

    const history = await collectReplyHistory(followUp as never, 'chronicler');
    expect(history?.messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
  });

  it('marks deleted or inaccessible references incomplete', async () => {
    const followUp = message('follow-up', 'Question');
    followUp.reference = {
      type: MessageReferenceType.Default,
      messageId: 'deleted',
      channelId: followUp.channelId,
      guildId: followUp.guildId,
    };
    followUp.fetchReference.mockRejectedValue(new Error('Missing Access'));

    await expect(collectReplyHistory(followUp as never, 'chronicler')).resolves.toEqual(
      { messages: [], incomplete: true },
    );
  });

  it('stops on a scope change, missing content, or a cycle', async () => {
    const crossChannel = message('cross', 'Hidden', { channelId: 'other' });
    const scoped = message('scoped', 'Question');
    scoped.reference = {
      type: MessageReferenceType.Default,
      messageId: crossChannel.id,
      channelId: scoped.channelId,
      guildId: scoped.guildId,
    };
    scoped.fetchReference.mockResolvedValue(crossChannel);
    expect(await collectReplyHistory(scoped as never, 'chronicler')).toEqual({
      messages: [],
      incomplete: true,
    });

    const empty = message('empty', '   ');
    const afterEmpty = message('after-empty', 'Question', { parent: empty });
    expect(await collectReplyHistory(afterEmpty as never, 'chronicler')).toEqual({
      messages: [],
      incomplete: true,
    });

    const cycle = message('cycle', 'Question');
    cycle.reference = {
      type: MessageReferenceType.Default,
      messageId: cycle.id,
      channelId: cycle.channelId,
      guildId: cycle.guildId,
    };
    expect(await collectReplyHistory(cycle as never, 'chronicler')).toEqual({
      messages: [],
      incomplete: true,
    });
    expect(cycle.fetchReference).not.toHaveBeenCalled();
  });

  it('keeps the nearest complete messages when the byte budget is reached', async () => {
    const older = message('older', 'a'.repeat(4_096));
    const nearer = message('nearer', 'b'.repeat(4_097), { parent: older });
    const current = message('current', 'Question', { parent: nearer });

    const history = await collectReplyHistory(current as never, 'chronicler');
    expect(history).toEqual({
      messages: [{ role: 'user', content: 'b'.repeat(4_097) }],
      incomplete: true,
    });
  });

  it('bounds ancestry to six exchanges', async () => {
    let parent = message('0', 'message 0');
    for (let index = 1; index <= MAX_REPLY_HISTORY_MESSAGES; index += 1) {
      parent = message(String(index), `message ${index}`, { parent });
    }
    const current = message('current', 'Question', { parent });

    const history = await collectReplyHistory(current as never, 'chronicler');
    expect(history?.messages).toHaveLength(MAX_REPLY_HISTORY_MESSAGES);
    expect(history?.messages[0]?.content).toBe('message 1');
    expect(history?.messages.at(-1)?.content).toBe(
      `message ${MAX_REPLY_HISTORY_MESSAGES}`,
    );
    expect(history?.incomplete).toBe(true);
  });
});
