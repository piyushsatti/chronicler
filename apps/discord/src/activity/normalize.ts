/**
 * Pure normalizers: discord.js gateway payloads -> SniffedEvent.
 *
 * Bot-authored activity is always skipped so the bot does not inflate its own
 * rollups. Voice join times live in a private Map for this process.
 */

import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Channel, Message, VoiceState } from 'discord.js';
import type { PersistedVoiceSession, SniffedEvent } from './types.js';

export interface ReactionGatewayDispatch {
  s: number;
  d: {
    user_id?: string;
    channel_id?: string;
    message_id?: string;
    guild_id?: string;
    member?: { user?: { bot?: boolean } };
  };
}

export function isPublicActivityChannel(channel: Channel | null | undefined): boolean {
  if (
    channel == null ||
    !('guild' in channel) ||
    channel.type === ChannelType.PrivateThread
  ) {
    return false;
  }
  const everyone = channel.guild.roles.everyone;
  return (
    everyone !== undefined &&
    channel.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) === true
  );
}

/** Normalize a MESSAGE_CREATE gateway payload. Returns null for bot authors,
 * system messages, or a payload missing the fields the backend requires. */
export function normalizeMessageCreate(message: Message): SniffedEvent | null {
  if (message === undefined || message === null || message.id === undefined) {
    return null;
  }
  if (message.author?.bot === true || message.system === true) {
    return null;
  }

  const channelId = message.channelId ?? message.channel?.id;
  const authorId = message.author?.id;
  if (!channelId || !authorId) {
    return null;
  }

  return {
    event_id: message.id,
    kind: 'message',
    discord_user_id: authorId,
    channel_id: channelId,
    occurred_at: message.createdAt.toISOString(),
    amount: 1,
  };
}

/** Stable but non-sensitive identity for one Gateway reaction dispatch. */
export function normalizeReactionDispatch(
  packet: ReactionGatewayDispatch,
  sessionId: string,
  botUserId?: string,
  now: () => number = Date.now,
): SniffedEvent | null {
  const { user_id: userId, channel_id: channelId, message_id: messageId } = packet.d;
  if (
    !sessionId ||
    !Number.isSafeInteger(packet.s) ||
    packet.s < 0 ||
    !userId ||
    !channelId ||
    !messageId ||
    packet.d.member?.user?.bot === true ||
    userId === botUserId
  ) {
    return null;
  }
  const sessionKey = createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
  return {
    event_id: `reaction:${sessionKey}:${packet.s}:${messageId}`,
    kind: 'reaction',
    discord_user_id: userId,
    channel_id: channelId,
    occurred_at: new Date(now()).toISOString(),
    amount: 1,
  };
}

export interface VoiceSessionTrackerOptions {
  now?: () => number;
  getChannel: (channelId: string) => Channel | undefined;
}

/**
 * Tracks per-user voice-channel join times and turns VOICE_STATE_UPDATE
 * transitions into voice-minute SniffedEvents on channel leave/switch.
 *
 * Join times live in memory for this process. A restart forgets open
 * sessions. The API receives one voice event when someone leaves, with the
 * minutes spent in the channel.
 */
export class VoiceSessionTracker {
  private readonly sessions = new Map<string, PersistedVoiceSession>();
  private readonly now: () => number;
  private readonly getChannel: (channelId: string) => Channel | undefined;

  constructor(options: VoiceSessionTrackerOptions) {
    this.now = options.now ?? Date.now;
    this.getChannel = options.getChannel;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Feed one VOICE_STATE_UPDATE transition. Returns a SniffedEvent when a
   * session closed (leave or channel switch) with >=1 minute elapsed;
   * null on join, mute/deaf-only changes, or sub-minute sessions.
   */
  handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): SniffedEvent | null {
    const isBot = newState.member?.user?.bot ?? oldState.member?.user?.bot ?? false;
    if (isBot) {
      return null;
    }

    const userId = newState.id ?? oldState.id;
    if (!userId) {
      return null;
    }

    const session = this.sessions.get(userId);
    if (
      session !== undefined &&
      !isPublicActivityChannel(this.getChannel(session.channelId))
    ) {
      this.sessions.delete(userId);
    }
    const wasInChannel =
      oldState.channelId != null &&
      isPublicActivityChannel(this.getChannel(oldState.channelId));
    const isInChannel =
      newState.channelId != null &&
      isPublicActivityChannel(this.getChannel(newState.channelId));

    if (!wasInChannel && isInChannel) {
      this.sessions.set(userId, {
        userId,
        channelId: newState.channelId as string,
        joinedAtMs: this.now(),
      });
      return null;
    }

    if (wasInChannel && !isInChannel) {
      return this.closeSession(userId, undefined, this.now());
    }

    if (wasInChannel && isInChannel && oldState.channelId !== newState.channelId) {
      const atMs = this.now();
      const replacement = {
        userId,
        channelId: newState.channelId as string,
        joinedAtMs: atMs,
      };
      const event = this.closeSession(userId, replacement, atMs);
      if (event === null && !this.sessions.has(userId)) {
        this.sessions.set(userId, replacement);
      }
      return event;
    }

    return null;
  }

  private closeSession(
    userId: string,
    replacement: PersistedVoiceSession | undefined,
    atMs: number,
  ): SniffedEvent | null {
    const session = this.sessions.get(userId);
    if (!session) {
      if (replacement !== undefined) {
        this.sessions.set(userId, replacement);
      }
      return null;
    }

    const minutes = Math.round((atMs - session.joinedAtMs) / 60_000);
    if (minutes < 1) {
      if (replacement === undefined) {
        this.sessions.delete(userId);
      } else {
        this.sessions.set(userId, replacement);
      }
      return null;
    }

    const event: SniffedEvent = {
      event_id: `voice:${userId}:${session.joinedAtMs}`,
      kind: 'voice',
      discord_user_id: userId,
      channel_id: session.channelId,
      occurred_at: new Date(atMs).toISOString(),
      amount: minutes,
    };
    if (replacement === undefined) {
      this.sessions.delete(userId);
    } else {
      this.sessions.set(userId, replacement);
    }
    return event;
  }

  /**
   * Reconcile open joins against the current guild voice-state snapshot.
   * Matching rows remain open. Missing or changed rows close at `atMs`;
   * newly observed rows open at that same instant.
   */
  reconcile(currentStates: Iterable<VoiceState>, atMs = this.now()): SniffedEvent[] {
    const current = new Map<string, VoiceState>();
    for (const state of currentStates) {
      const userId = state.id;
      const isBot = state.member?.user?.bot ?? false;
      if (
        userId &&
        !isBot &&
        typeof state.channelId === 'string' &&
        isPublicActivityChannel(this.getChannel(state.channelId))
      ) {
        current.set(userId, state);
      }
    }

    const events: SniffedEvent[] = [];
    for (const session of [...this.sessions.values()]) {
      if (!isPublicActivityChannel(this.getChannel(session.channelId))) {
        this.sessions.delete(session.userId);
        continue;
      }
      const state = current.get(session.userId);
      if (state === undefined) {
        const event = this.closePersistedSession(session, atMs, true);
        this.sessions.delete(session.userId);
        if (event !== null) events.push(event);
        continue;
      }
      current.delete(session.userId);
      if (state.channelId !== session.channelId) {
        const event = this.closePersistedSession(session, atMs, true);
        this.sessions.set(session.userId, {
          userId: session.userId,
          channelId: state.channelId as string,
          joinedAtMs: atMs,
        });
        if (event !== null) events.push(event);
      }
    }

    for (const [userId, state] of current) {
      this.sessions.set(userId, {
        userId,
        channelId: state.channelId as string,
        joinedAtMs: atMs,
      });
    }
    return events;
  }

  private closePersistedSession(
    session: PersistedVoiceSession,
    atMs: number,
    recovery: boolean,
  ): SniffedEvent | null {
    const minutes = Math.round((atMs - session.joinedAtMs) / 60_000);
    if (minutes < 1) {
      return null;
    }
    return {
      event_id: recovery
        ? `voice:recovery:${session.userId}:${session.channelId}:${session.joinedAtMs}:${atMs}`
        : `voice:${session.userId}:${session.joinedAtMs}`,
      kind: 'voice',
      discord_user_id: session.userId,
      channel_id: session.channelId,
      occurred_at: new Date(atMs).toISOString(),
      amount: minutes,
    };
  }
}
