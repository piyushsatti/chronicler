/**
 * Tests for the v2 gateway sniffer normalizers (#91).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    channelId: 'chan-1',
    guildId: 'guild-1',
    author: { id: 'user-1', username: 'alice', globalName: null, bot: false },
    content: 'hello',
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    editedAt: null,
    ...overrides,
  };
}

describe('normalizeMessageCreate', () => {
  it('normalizes a human-authored message to a message SniffedEvent', async () => {
    const { normalizeMessageCreate } = await import('@discord/activity/normalize.js');

    const event = normalizeMessageCreate(fakeMessage() as never);

    expect(event).toEqual({
      event_id: 'msg-1',
      kind: 'message',
      discord_user_id: 'user-1',
      channel_id: 'chan-1',
      occurred_at: '2026-07-01T12:00:00.000Z',
      amount: 1,
    });
  });

  it('skips bot-authored messages', async () => {
    const { normalizeMessageCreate } = await import('@discord/activity/normalize.js');

    const event = normalizeMessageCreate(
      fakeMessage({
        author: { id: 'bot-1', username: 'chronicler', globalName: null, bot: true },
      }) as never,
    );

    expect(event).toBeNull();
  });

  it('skips a message missing a channel id', async () => {
    const { normalizeMessageCreate } = await import('@discord/activity/normalize.js');

    const event = normalizeMessageCreate(
      fakeMessage({ channelId: undefined, channel: undefined }) as never,
    );

    expect(event).toBeNull();
  });

  it('returns null for an undefined payload', async () => {
    const { normalizeMessageCreate } = await import('@discord/activity/normalize.js');

    expect(normalizeMessageCreate(undefined as never)).toBeNull();
  });
});

describe('normalizeReactionDispatch', () => {
  const packet = {
    s: 42,
    d: {
      user_id: 'user-7',
      channel_id: 'chan-1',
      message_id: '112233445566778899',
      guild_id: 'guild-1',
      member: { user: { bot: false } },
    },
  };

  it('uses hashed session and dispatch sequence as stable identity', async () => {
    const { normalizeReactionDispatch } = await import('@discord/activity/normalize.js');

    const receivedAt = () => Date.parse('2026-09-13T12:34:56.000Z');
    const first = normalizeReactionDispatch(
      packet,
      'gateway-session-secret',
      undefined,
      receivedAt,
    );
    const replay = normalizeReactionDispatch(
      packet,
      'gateway-session-secret',
      undefined,
      receivedAt,
    );
    const reAdd = normalizeReactionDispatch(
      { ...packet, s: 43 },
      'gateway-session-secret',
      undefined,
      receivedAt,
    );

    expect(first?.event_id).toBe(replay?.event_id);
    expect(reAdd?.event_id).not.toBe(first?.event_id);
    expect(first?.event_id).not.toContain('gateway-session-secret');
    expect(first).toMatchObject({
      kind: 'reaction',
      discord_user_id: 'user-7',
      channel_id: 'chan-1',
      amount: 1,
      occurred_at: '2026-09-13T12:34:56.000Z',
    });
  });

  it('requires session identity and skips the bot user', async () => {
    const { normalizeReactionDispatch } = await import('@discord/activity/normalize.js');

    expect(normalizeReactionDispatch(packet, '')).toBeNull();
    expect(normalizeReactionDispatch(packet, 'session', 'user-7')).toBeNull();
  });
});

describe('VoiceSessionTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeVoiceState(channelId: string | null, userId = 'user-1', bot = false) {
    return {
      id: userId,
      channelId,
      member: { user: { bot } },
    };
  }

  it('returns null on join (opens a session, nothing to forward yet)', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    const event = tracker.handleVoiceStateUpdate(
      fakeVoiceState(null) as never,
      fakeVoiceState('voice-1') as never,
    );

    expect(event).toBeNull();
  });

  it('emits a voice SniffedEvent on leave with rounded elapsed minutes', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    tracker.handleVoiceStateUpdate(
      fakeVoiceState(null) as never,
      fakeVoiceState('voice-1') as never,
    );
    vi.advanceTimersByTime(90_000); // 90s -> rounds to 2 minutes

    const event = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1') as never,
      fakeVoiceState(null) as never,
    );

    expect(event).toMatchObject({
      kind: 'voice',
      discord_user_id: 'user-1',
      channel_id: 'voice-1',
      amount: 2,
    });
    expect(event?.event_id).toContain('voice:user-1:');
  });

  it('returns null for a sub-minute session', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    tracker.handleVoiceStateUpdate(
      fakeVoiceState(null) as never,
      fakeVoiceState('voice-1') as never,
    );
    vi.advanceTimersByTime(10_000); // 10s -> rounds to 0 minutes

    const event = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1') as never,
      fakeVoiceState(null) as never,
    );

    expect(event).toBeNull();
  });

  it('closes the old session and opens a new one on channel switch', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    tracker.handleVoiceStateUpdate(
      fakeVoiceState(null) as never,
      fakeVoiceState('voice-1') as never,
    );
    vi.advanceTimersByTime(120_000); // 2 minutes in voice-1

    const switchEvent = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1') as never,
      fakeVoiceState('voice-2') as never,
    );

    expect(switchEvent).toMatchObject({ channel_id: 'voice-1', amount: 2 });

    vi.advanceTimersByTime(60_000); // 1 minute in voice-2
    const leaveEvent = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-2') as never,
      fakeVoiceState(null) as never,
    );

    expect(leaveEvent).toMatchObject({ channel_id: 'voice-2', amount: 1 });
  });

  it('ignores mute/deaf-only updates (no channel transition)', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    tracker.handleVoiceStateUpdate(
      fakeVoiceState(null) as never,
      fakeVoiceState('voice-1') as never,
    );
    const event = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1') as never,
      fakeVoiceState('voice-1') as never,
    );

    expect(event).toBeNull();
  });

  it('ignores bot voice states entirely', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    tracker.handleVoiceStateUpdate(
      fakeVoiceState(null, 'bot-1', true) as never,
      fakeVoiceState('voice-1', 'bot-1', true) as never,
    );
    vi.advanceTimersByTime(120_000);
    const event = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1', 'bot-1', true) as never,
      fakeVoiceState(null, 'bot-1', true) as never,
    );

    expect(event).toBeNull();
  });

  it('starts empty and emits nothing for time it did not see', async () => {
    const { VoiceSessionTracker } = await import('@discord/activity/normalize.js');
    const tracker = new VoiceSessionTracker();

    expect(tracker.sessionCount()).toBe(0);
    const leave = tracker.handleVoiceStateUpdate(
      fakeVoiceState('voice-1') as never,
      fakeVoiceState(null) as never,
    );
    expect(leave).toBeNull();
  });
});
