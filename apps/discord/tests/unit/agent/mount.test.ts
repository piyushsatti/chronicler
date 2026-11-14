import { EventEmitter } from 'node:events';
import { ChannelType, MessageReferenceType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAgent } from '@discord/agent/mount.js';
import { OUTCOME_TEXT } from '@discord/agent/broker.js';
import { logger } from '@discord/log.js';
import { testConfig } from '../../support/config.js';

const state = vi.hoisted(() => ({
  run: vi.fn(),
  collect: vi.fn(),
  fetchDirect: vi.fn(),
}));

vi.mock('@discord/agent/broker.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@discord/agent/broker.js')>();
  return {
    ...mod,
    runQuestion: (
      job: unknown,
      _api: unknown,
      _o: unknown,
    ) => state.run(job),
  };
});

vi.mock('@discord/agent/reply-context.js', () => ({
  collectReplyHistory: (...args: unknown[]) => state.collect(...args),
  fetchDirectReplyToBot: (...args: unknown[]) => state.fetchDirect(...args),
}));

const agentConfig = testConfig({
  agentEnabled: true,
  agentMaxConcurrent: 2,
  agentQueueCapacity: 25,
  agentAllowedDmUserIds: new Set(['owner']),
  agentAllowedGuildIds: new Set<string>(),
  agentAllowedChannelIds: new Set<string>(),
  agentPublicOrigin: 'https://chronicler.example',
});

function fixture(id = 'message-1') {
  const client = new EventEmitter() as EventEmitter & { user: { id: string } };
  client.user = { id: 'bot' };
  const reply = vi.fn().mockResolvedValue(undefined);
  const sendTyping = vi.fn().mockResolvedValue(undefined);
  const message = {
    id,
    author: { id: 'owner', bot: false },
    webhookId: null,
    guildId: null,
    channelId: 'dm-1',
    content: '<@bot> What is a Shove action?',
    mentions: { users: { has: (uid: string) => uid === 'bot' } },
    channel: {
      type: ChannelType.DM,
      isThread: () => false,
      sendTyping,
    },
    reference: null,
    fetchReference: vi.fn(),
    reply,
  };
  return { client, message, reply, sendTyping };
}

function replyFixture() {
  const fixtureValue = fixture();
  const first = {
    id: 'message-0',
    author: { id: 'owner', bot: false },
    guildId: null,
    channelId: 'dm-1',
    content: 'How many attacks at level 5?',
    reference: null,
  };
  const answer = {
    id: 'answer-1',
    author: { id: 'bot', bot: true },
    guildId: null,
    channelId: 'dm-1',
    content: 'It depends on your class.',
    reference: {
      type: MessageReferenceType.Default,
      messageId: first.id,
      channelId: 'dm-1',
      guildId: null,
    },
    fetchReference: vi.fn().mockResolvedValue(first),
  };
  Object.assign(fixtureValue.message, {
    content: 'What if I am a fighter?',
    mentions: { users: { has: () => false } },
    reference: {
      type: MessageReferenceType.Default,
      messageId: answer.id,
      channelId: 'dm-1',
      guildId: null,
    },
    fetchReference: vi.fn().mockResolvedValue(answer),
  });
  return fixtureValue;
}

describe('mountAgent', () => {
  beforeEach(() => {
    state.run.mockReset().mockImplementation(async (job: { job_id: string }) => ({
      kind: 'answered',
      result: {
        version: 1,
        type: 'question.completed',
        job_id: job.job_id,
        answer: 'A Shove can push a target.',
        sources: [],
      },
    }));
    state.collect.mockReset().mockResolvedValue(undefined);
    state.fetchDirect.mockReset().mockResolvedValue(undefined);
  });

  it('posts the question and replies with the API result', async () => {
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'A Shove can push a target.' }),
      ),
    );
    expect(state.run).toHaveBeenCalled();
    await mounted.close();
  });

  it('does not reply when the result arrives after close', async () => {
    let release: (value: unknown) => void = () => undefined;
    state.run.mockImplementation(
      (job: { job_id: string }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              kind: 'answered',
              result: {
                version: 1,
                type: 'question.completed',
                job_id: job.job_id,
                answer: 'Too late.',
                sources: [],
              },
            });
        }),
    );
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalled());
    await mounted.close();
    release(undefined);
    await new Promise((resolve) => setImmediate(resolve));
    expect(reply).not.toHaveBeenCalled();
  });

  it('shows a failure when the API rejects the question', async () => {
    state.run.mockResolvedValue({ kind: 'rejected', status: 500 });
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("couldn't finish"),
        }),
      ),
    );
    await mounted.close();
  });

  it('publishes reply ancestry separately from the unchanged question', async () => {
    state.collect.mockResolvedValue({
      messages: [
        { role: 'user', content: 'How many attacks at level 5?' },
        { role: 'assistant', content: 'It depends on your class.' },
      ],
      incomplete: false,
    });
    state.fetchDirect.mockResolvedValue({
      id: 'answer-1',
      author: { id: 'bot', bot: true },
      content: 'It depends on your class.',
      reference: { messageId: 'message-0' },
      fetchReference: vi.fn().mockResolvedValue({
        id: 'message-0',
        author: { id: 'owner', bot: false },
        content: 'How many attacks at level 5?',
        reference: null,
      }),
    });
    const { client, message } = replyFixture();
    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalled());

    expect(state.run.mock.calls[0]?.[0]).toMatchObject({
      question: 'What if I am a fighter?',
      history: {
        messages: [
          { role: 'user', content: 'How many attacks at level 5?' },
          { role: 'assistant', content: 'It depends on your class.' },
        ],
        incomplete: false,
      },
    });
    expect(state.fetchDirect).toHaveBeenCalledOnce();
    await mounted.close();
  });

  it.each([
    ['another human', { id: 'other-human', bot: false }],
    ['another bot', { id: 'other-bot', bot: true }],
  ])('does not trigger for a direct reply to %s', async (_label, author) => {
    const { client, message } = fixture();
    const referenced = {
      id: 'unrelated',
      author,
      guildId: null,
      channelId: 'dm-1',
      content: 'Unrelated conversation',
      reference: null,
      fetchReference: vi.fn(),
    };
    state.fetchDirect.mockResolvedValue(undefined);
    Object.assign(message, {
      content: 'Following up',
      mentions: { users: { has: () => false } },
      reference: {
        type: MessageReferenceType.Default,
        messageId: referenced.id,
        channelId: 'dm-1',
        guildId: null,
      },
      fetchReference: vi.fn().mockResolvedValue(referenced),
    });

    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.fetchDirect).toHaveBeenCalledOnce());
    expect(state.run).not.toHaveBeenCalled();
    await mounted.close();
  });

  it('preserves the mention trigger when replying to a human', async () => {
    state.collect.mockResolvedValue({
      messages: [{ role: 'user', content: 'How many attacks at level 5?' }],
      incomplete: false,
    });
    const { client, message } = fixture();
    const referenced = {
      id: 'human-message',
      author: { id: 'other-human', bot: false },
      guildId: null,
      channelId: 'dm-1',
      content: 'How many attacks at level 5?',
      reference: null,
      fetchReference: vi.fn(),
    };
    Object.assign(message, {
      reference: {
        type: MessageReferenceType.Default,
        messageId: referenced.id,
        channelId: 'dm-1',
        guildId: null,
      },
      fetchReference: vi.fn().mockResolvedValue(referenced),
    });

    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledOnce());
    expect(state.run.mock.calls[0]?.[0]).toMatchObject({
      question: 'What is a Shove action?',
      history: {
        messages: [{ role: 'user', content: 'How many attacks at level 5?' }],
        incomplete: false,
      },
    });
    await mounted.close();
  });

  it('does not trigger for fresh ambient chatter', async () => {
    const { client, message } = fixture();
    Object.assign(message, {
      content: 'Anyone know this rule?',
      mentions: { users: { has: () => false } },
    });

    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(message.fetchReference).not.toHaveBeenCalled();
    expect(state.run).not.toHaveBeenCalled();
    await mounted.close();
  });

  it('checks local access before resolving a reply target', async () => {
    const { client, message } = replyFixture();
    message.author.id = 'not-allowed';

    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(state.fetchDirect).not.toHaveBeenCalled();
    expect(state.run).not.toHaveBeenCalled();
    await mounted.close();
  });

  it('admits at most three mentions before typing and sends one Please wait', async () => {
    state.run.mockImplementation(
      () =>
        new Promise(() => {
          /* hold slots so capacity is irrelevant */
        }),
    );
    const { client } = fixture();
    const mounted = await mountAgent(client as never, agentConfig);
    const typingCounts: number[] = [];
    const replies: string[] = [];
    let collectCalls = 0;
    state.collect.mockImplementation(async () => {
      collectCalls += 1;
      return undefined;
    });

    for (let n = 0; n < 10; n += 1) {
      const { message, sendTyping, reply } = fixture(`message-${n}`);
      reply.mockImplementation(async (payload: { content: string }) => {
        replies.push(payload.content);
      });
      client.emit('messageCreate', message);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      typingCounts.push(sendTyping.mock.calls.length);
    }

    const typingTotal = typingCounts.reduce((a, b) => a + b, 0);
    expect(typingTotal).toBeLessThanOrEqual(3);
    expect(collectCalls).toBe(3);
    expect(replies.filter((text) => text === OUTCOME_TEXT.rate_limited)).toHaveLength(1);
    await mounted.close();
  });

  it('logs delivery failure once and does not send a second reply', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { client, message, reply } = fixture();
    reply.mockRejectedValue(Object.assign(new Error('Missing Access'), { code: 50001 }));
    const mounted = await mountAgent(client as never, agentConfig);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setImmediate(resolve));
    expect(reply).toHaveBeenCalledTimes(1);
    expect(
      warn.mock.calls.some(
        ([msg]) => msg === 'Agent reply delivery failed',
      ),
    ).toBe(true);
    warn.mockRestore();
    await mounted.close();
  });

  it('retries Please wait after a failed rate-limit notice delivery', async () => {
    state.run.mockImplementation(
      () =>
        new Promise(() => {
          /* hold slots */
        }),
    );
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { client } = fixture();
    const mounted = await mountAgent(client as never, agentConfig);
    const replies: string[] = [];
    let failedNotice = false;

    for (let n = 0; n < 5; n += 1) {
      const { message, reply } = fixture(`message-${n}`);
      reply.mockImplementation(async (payload: { content: string }) => {
        if (payload.content === OUTCOME_TEXT.rate_limited && !failedNotice) {
          failedNotice = true;
          throw Object.assign(new Error('Missing Access'), { code: 50001 });
        }
        replies.push(payload.content);
      });
      client.emit('messageCreate', message);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(failedNotice).toBe(true);
    expect(replies.filter((text) => text === OUTCOME_TEXT.rate_limited)).toHaveLength(1);
    warn.mockRestore();
    await mounted.close();
  });
});
