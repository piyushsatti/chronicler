import { describe, expect, it } from 'vitest';
import {
  DISCORD_GENERIC_REASON,
  discordFailureReason,
  isDiscordDeliveryTerminal,
} from '../../src/utils/discordDelivery.js';

describe('discordFailureReason', () => {
  it('is null when nothing failed', () => {
    expect(discordFailureReason(null)).toBeNull();
    expect(discordFailureReason(undefined)).toBeNull();
    expect(discordFailureReason('  ')).toBeNull();
  });

  it('maps known Discord statuses to plain reasons and never shows the raw text', () => {
    const raw = 'discord api status 403: {"message": "Missing Access", "code": 50001}';
    const reason = discordFailureReason(raw);
    expect(reason).toBe('the bot may not post in the quest channel');
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
