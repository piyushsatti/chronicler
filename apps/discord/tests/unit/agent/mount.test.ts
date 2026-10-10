import { EventEmitter } from 'node:events';
import { ChannelType, MessageReferenceType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  submit: vi.fn(),
}));

vi.mock('@discord/config.js', () => ({
  config: {
    agentEnabled: true,
    agentMaxConcurrent: 2,
    agentQueueCapacity: 25,
    agentAllowedDmUserIds: new Set(['owner']),
    agentAllowedGuildIds: new Set<string>(),
    agentAllowedChannelIds: new Set<string>(),
    agentPublicOrigin: 'https://chronicler.example',
  },
}));
vi.mock('@discord/agent/broker.js', () => ({
  submitQuestion: (job: unknown) => state.submit(job),
}));

import { mountAgent } from '@discord/agent/mount.js';

function fixture() {
  const client = new EventEmitter() as EventEmitter & { user: { id: string } };
  client.user = { id: 'bot' };
  const reply = vi.fn().mockResolvedValue(undefined);
  const message = {
    id: 'message-1',
    author: { id: 'owner', bot: false },
    webhookId: null,
    guildId: null,
    channelId: 'dm-1',
    content: '<@bot> What is a Shove action?',
    mentions: { users: { has: (id: string) => id === 'bot' } },
    channel: {
      type: ChannelType.DM,
      isThread: () => false,
      sendTyping: vi.fn().mockResolvedValue(undefined),
    },
    reference: null,
    fetchReference: vi.fn(),
    reply,
  };
  return { client, message, reply };
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
    state.submit.mockReset().mockImplementation(async (job: { job_id: string }) => ({
      version: 1,
      type: 'question.completed',
      job_id: job.job_id,
      answer: 'A Shove can push a target.',
      sources: [],
    }));
  });

  it('posts the question and replies with the API result', async () => {
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'A Shove can push a target.' }),
      ),
    );
    expect(state.submit).toHaveBeenCalled();
    await mounted.close();
  });

  it('does not reply when the result arrives after close', async () => {
    let release: (value: unknown) => void = () => undefined;
    state.submit.mockImplementation(
      (job: { job_id: string }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              version: 1,
              type: 'question.completed',
              job_id: job.job_id,
              answer: 'Too late.',
              sources: [],
            });
        }),
    );
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalled());
    await mounted.close();
    release(undefined);
    await new Promise((resolve) => setImmediate(resolve));
    expect(reply).not.toHaveBeenCalled();
  });

  it('shows a failure when the API rejects the question', async () => {
    state.submit.mockRejectedValue(new Error('api down'));
    const { client, message, reply } = fixture();
    const mounted = await mountAgent(client as never);
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
    const { client, message } = replyFixture();
    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalled());

    expect(state.submit.mock.calls[0]?.[0]).toMatchObject({
      question: 'What if I am a fighter?',
      history: {
        messages: [
          { role: 'user', content: 'How many attacks at level 5?' },
          { role: 'assistant', content: 'It depends on your class.' },
        ],
        incomplete: false,
      },
    });
    expect(message.fetchReference).toHaveBeenCalledOnce();
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

    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(message.fetchReference).toHaveBeenCalledOnce());
    expect(referenced.fetchReference).not.toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
    await mounted.close();
  });

  it('preserves the mention trigger when replying to a human', async () => {
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

    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalledOnce());
    expect(state.submit.mock.calls[0]?.[0]).toMatchObject({
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

    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(message.fetchReference).not.toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
    await mounted.close();
  });

  it('checks local access before resolving a reply target', async () => {
    const { client, message } = replyFixture();
    message.author.id = 'not-allowed';

    const mounted = await mountAgent(client as never);
    client.emit('messageCreate', message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(message.fetchReference).not.toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
    await mounted.close();
  });
});
