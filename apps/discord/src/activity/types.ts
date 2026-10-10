/**
 * Wire shape for the v2 gateway sniffer (#91).
 *
 * Matches `DiscordEventPayload` in
 * `chronicler/api/routers/ingest_v2.py` exactly (snake_case keys, same
 * field set) -- this is the bot's half of that contract. Do not rename
 * fields here without updating the backend router in lockstep.
 */

/** The three activity kinds the backend's `EventKind` enum accepts. */
export type SniffedEventKind = 'message' | 'voice' | 'reaction';

/** One normalized gateway event, ready to POST to `/v1/ingest/discord-event`. */
export interface SniffedEvent {
  /** Stable id for this event. Snowflake for messages; deterministic
   *  composite for voice/reaction (see sniffer/normalize.ts). Reused
   *  verbatim across queue retries so backend dedup (decision 70) applies. */
  event_id: string;
  kind: SniffedEventKind;
  discord_user_id: string;
  channel_id: string;
  /** ISO-8601 timestamp, always tz-aware (backend rejects naive datetimes). */
  occurred_at: string;
  /** Metric magnitude: message/reaction count (normally 1) or voice minutes. */
  amount: number;
}

/** A voice join held in memory until the person leaves. */
export interface PersistedVoiceSession {
  userId: string;
  channelId: string;
  joinedAtMs: number;
}
