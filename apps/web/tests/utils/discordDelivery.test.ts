import { describe, expect, it } from 'vitest';
import {
  DISCORD_GENERIC_REASON,
  DISCORD_PERMISSION_REASON,
  discordFailureReason,
  discordSafeErrorReason,
  isDiscordDeliveryTerminal,
} from '../../src/utils/discordDelivery.js';

describe('discordSafeErrorReason', () => {
  it('maps each delivery failure code to one sentence and leaves unknown codes alone', () => {
    expect(discordSafeErrorReason('DISCORD_PERMISSION')).toBe(DISCORD_PERMISSION_REASON);
    expect(discordSafeErrorReason('DISCORD_NOT_FOUND')).toBe(
      'the quest channel or its post was not found',
    );
    expect(discordSafeErrorReason('DISCORD_RATE_LIMIT')).toBe(
      'Discord is limiting how fast posts are sent',
    );
    expect(discordSafeErrorReason('DISCORD_UNAVAILABLE')).toBe('Discord was unavailable');
    expect(discordSafeErrorReason('DISCORD_UNAUTHORIZED')).toBe('Discord refused the bot’s login');
    expect(discordSafeErrorReason('DISCORD_NOT_CONFIGURED')).toBe(
      'Discord posting is not set up for this community',
    );
    expect(discordSafeErrorReason('DISCORD_REJECTED')).toBe(DISCORD_GENERIC_REASON);
    expect(discordSafeErrorReason('SOMETHING_ELSE')).toBeNull();
    expect(discordSafeErrorReason(null)).toBeNull();
  });
});

describe('discordFailureReason', () => {
  it('is null when nothing failed', () => {
    expect(discordFailureReason(null)).toBeNull();
    expect(discordFailureReason(undefined)).toBeNull();
    expect(discordFailureReason('  ')).toBeNull();
  });

  it('maps known Discord statuses to plain reasons and never shows the raw text', () => {
    const raw = 'discord api status 403: {"message": "Missing Access", "code": 50001}';
    const reason = discordFailureReason(raw);
    expect(reason).toBe(DISCORD_PERMISSION_REASON);
    expect(reason).toBe(
      'The bot is missing a Discord permission in the quest channel. An admin must fix it, then retry.',
    );
    expect(reason).not.toMatch(/Missing Access|50001|discord api/);
    expect(discordFailureReason('discord api status 404')).toBe(
      'the quest channel or its post was not found',
    );
    expect(discordFailureReason('discord api status 429: slow down')).toBe(
      'Discord is limiting how fast posts are sent',
    );
    expect(discordFailureReason('discord api status 502: bad gateway')).toBe(
      'Discord was unavailable',
    );
    expect(
      discordFailureReason('discord api status 400: {"content": ["too long"]}'),
    ).toBe(DISCORD_GENERIC_REASON);
  });

  it('maps setup and network failures', () => {
    expect(discordFailureReason('discord delivery not configured')).toBe(
      'Discord posting is not set up for this community',
    );
    expect(
      discordFailureReason('discord create message: dial tcp 1.2.3.4:443: i/o timeout'),
    ).toBe('Discord could not be reached');
  });

  it('falls back to the generic reason for unknown text', () => {
    expect(
      discordFailureReason('This request could not be completed. Please try again.'),
    ).toBe('Discord rejected the post');
    expect(discordFailureReason('pq: deadlock detected')).toBe(
      'Discord rejected the post',
    );
  });
});

describe('isDiscordDeliveryTerminal', () => {
  it('treats settled statuses and caught-up revisions as terminal', () => {
    const base = { desiredRevision: 2, appliedRevision: 1 };
    expect(isDiscordDeliveryTerminal({ ...base, overallStatus: 'SYNCED' })).toBe(true);
    expect(isDiscordDeliveryTerminal({ ...base, overallStatus: 'error' })).toBe(true);
    expect(isDiscordDeliveryTerminal({ ...base, overallStatus: 'pending' })).toBe(
      false,
    );
    expect(
      isDiscordDeliveryTerminal({
        overallStatus: 'pending',
        desiredRevision: 2,
        appliedRevision: 2,
      }),
    ).toBe(true);
  });
});
