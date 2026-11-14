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

const MAX_VOICE_SEGMENT_MINUTES = 1440;
const SEGMENT_MS = MAX_VOICE_SEGMENT_MINUTES * 60_000;

function splitVoiceSegments(args: {
  userId: string;
  channelId: string;
  joinedAtMs: number;
  atMs: number;
  recovery: boolean;
}): SniffedEvent[] {
  const totalMinutes = Math.round((args.atMs - args.joinedAtMs) / 60_000);
  if (totalMinutes < 1) {
    return [];
  }
  const events: SniffedEvent[] = [];
  let remaining = totalMinutes;
  let segment = 0;
  while (remaining > 0) {
    const amount = Math.min(remaining, MAX_VOICE_SEGMENT_MINUTES);
    const segmentStartMs = args.joinedAtMs + segment * SEGMENT_MS;
    events.push({
      event_id: args.recovery
        ? `voice:recovery:${args.userId}:${args.channelId}:${segmentStartMs}:${args.atMs}`
        : `voice:${args.userId}:${segmentStartMs}`,
      kind: 'voice',
      discord_user_id: args.userId,
      channel_id: args.channelId,
      occurred_at: new Date(args.atMs).toISOString(),
      amount,
    });
    remaining -= amount;
    segment += 1;
  }
  return events;
}

/**
 * Tracks per-user voice-channel join times and turns VOICE_STATE_UPDATE
 * transitions into voice-minute SniffedEvents on channel leave/switch.
 *
 * Join times live in memory for this process. A restart forgets open
 * sessions. The API receives voice segment events when someone leaves.
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
   * Feed one VOICE_STATE_UPDATE transition. Returns voice segments when a
   * session closed (leave or channel switch) with >=1 minute elapsed;
   * empty on join, mute/deaf-only changes, or sub-minute sessions.
   */
  handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): SniffedEvent[] {
    const isBot = newState.member?.user?.bot ?? oldState.member?.user?.bot ?? false;
    if (isBot) {
      return [];
    }

    const userId = newState.id ?? oldState.id;
    if (!userId) {
      return [];
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
      return [];
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
      const events = this.closeSession(userId, replacement, atMs);
      if (events.length === 0 && !this.sessions.has(userId)) {
        this.sessions.set(userId, replacement);
      }
      return events;
    }

    return [];
  }

  private closeSession(
    userId: string,
    replacement: PersistedVoiceSession | undefined,
    atMs: number,
  ): SniffedEvent[] {
    const session = this.sessions.get(userId);
    if (!session) {
      if (replacement !== undefined) {
        this.sessions.set(userId, replacement);
      }
      return [];
    }

    const events = splitVoiceSegments({
      userId,
      channelId: session.channelId,
      joinedAtMs: session.joinedAtMs,
      atMs,
      recovery: false,
    });
    if (replacement === undefined) {
      this.sessions.delete(userId);
    } else {
      this.sessions.set(userId, replacement);
    }
    return events;
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
        events.push(...this.closePersistedSession(session, atMs, true));
        this.sessions.delete(session.userId);
        continue;
      }
      current.delete(session.userId);
      if (state.channelId !== session.channelId) {
        events.push(...this.closePersistedSession(session, atMs, true));
        this.sessions.set(session.userId, {
          userId: session.userId,
          channelId: state.channelId as string,
          joinedAtMs: atMs,
        });
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
  ): SniffedEvent[] {
    return splitVoiceSegments({
      userId: session.userId,
      channelId: session.channelId,
      joinedAtMs: session.joinedAtMs,
      atMs,
      recovery,
    });
  }
}
