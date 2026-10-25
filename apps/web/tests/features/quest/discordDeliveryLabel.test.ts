import { describe, expect, it } from 'vitest';
import { discordDeliveryLabel } from '../../../src/features/quest/components/DiscordDeliveryStatus.js';
import type { DiscordDeliveryView } from '../../../src/features/quest/adapters/questAdapter.js';

function delivery(overrides: Partial<DiscordDeliveryView>): DiscordDeliveryView {
  return {
    desiredRevision: 1,
    appliedRevision: 0,
    overallStatus: 'pending',
    isTerminal: false,
    nextRetryAt: null,
    lastAttemptFailed: false,
    failureReason: null,
    ...overrides,
  };
}

describe('discordDeliveryLabel', () => {
  it('says a new quest is being posted, then that it was posted', () => {
    expect(discordDeliveryLabel(delivery({}))).toBe('Posting to Discord…');
    expect(
      discordDeliveryLabel(
        delivery({ overallStatus: 'synced', appliedRevision: 1, isTerminal: true }),
      ),
    ).toBe('Posted to Discord');
  });

  it('says an edit is updating the same post, then that it was updated', () => {
    expect(
      discordDeliveryLabel(delivery({ desiredRevision: 3, appliedRevision: 2 })),
    ).toBe('Updating the Discord post…');
    expect(
      discordDeliveryLabel(
        delivery({
          overallStatus: 'synced',
          desiredRevision: 3,
          appliedRevision: 3,
          isTerminal: true,
        }),
      ),
    ).toBe('Discord post updated');
  });

  it('names a failed attempt and when the next one runs', () => {
    expect(
      discordDeliveryLabel(
        delivery({ lastAttemptFailed: true, nextRetryAt: '2026-10-25T18:00:00Z' }),
        (value) => `at ${value}`,
      ),
    ).toBe(
      'Discord post failed: the last attempt did not go through. Next try at 2026-10-25T18:00:00Z.',
    );
    expect(discordDeliveryLabel(delivery({ lastAttemptFailed: true }))).toMatch(
      /^Discord post failed: .*Retrying soon\.$/,
    );
  });

  it('names the plain failure reason when one is known', () => {
    expect(
      discordDeliveryLabel(
        delivery({
          lastAttemptFailed: true,
          failureReason: 'the bot may not post in the quest channel',
          nextRetryAt: '2026-10-25T18:00:00Z',
        }),
        (value) => `at ${value}`,
      ),
    ).toBe(
      'Discord post failed: the bot may not post in the quest channel. Next try at 2026-10-25T18:00:00Z.',
    );
    expect(
      discordDeliveryLabel(
        delivery({
          overallStatus: 'error',
          isTerminal: true,
          lastAttemptFailed: true,
          failureReason: 'Discord rejected the post',
        }),
      ),
    ).toBe('Discord post failed: Discord rejected the post. Attempts have stopped.');
  });

  it('says when attempts have stopped', () => {
    expect(
      discordDeliveryLabel(delivery({ overallStatus: 'error', isTerminal: true })),
    ).toBe(
      'Discord post failed: the quest could not be posted to Discord. Attempts have stopped.',
    );
    expect(
      discordDeliveryLabel(
        delivery({ overallStatus: 'error', appliedRevision: 1, isTerminal: true }),
      ),
    ).toMatch(/latest changes could not be sent/);
  });

  it('says a quest with nothing queued was not posted', () => {
    expect(
      discordDeliveryLabel(
        delivery({ overallStatus: 'idle', desiredRevision: 0, isTerminal: true }),
      ),
    ).toBe('Not posted to Discord');
  });

  it('keeps the generic label for statuses it does not know', () => {
    expect(
      discordDeliveryLabel(delivery({ overallStatus: 'skipped', isTerminal: true })),
    ).toBe('Discord post skipped');
    expect(discordDeliveryLabel(delivery({ overallStatus: 'mystery' }))).toBe(
      'Discord post pending',
    );
  });
});
