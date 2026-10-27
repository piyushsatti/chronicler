import { describe, expect, it } from 'vitest';
import {
  discordSettingsInput,
  isSnowflake,
  validateDiscordSettings,
} from '../../../src/features/admin/adapters/discordSettingsForm.js';

const form = (over: Partial<Parameters<typeof validateDiscordSettings>[0]> = {}) => ({
  announceChannelId: '',
  roleId: '',
  voiceChannels: [],
  ...over,
});

describe('Discord settings form', () => {
  it.each([
    ['1234567890123456', false],
    ['12345678901234567', true],
    ['12345678901234567890', true],
    ['123456789012345678901', false],
    ['1234567890123456x8', false],
    ['', false],
  ])('treats %s as a snowflake: %s', (value, ok) => {
    expect(isSnowflake(value)).toBe(ok);
  });

  it('accepts an empty form (everything optional)', () => {
    expect(validateDiscordSettings(form()).summary).toEqual([]);
  });

  it('names each broken field', () => {
    const errors = validateDiscordSettings(
      form({
        announceChannelId: 'abc',
        voiceChannels: [{ key: 7, name: '', channelId: '1' }],
      }),
    );
    expect(errors.announceChannelId).toMatch(/17 to 20 digits/);
    expect(errors.voiceChannels[7]).toEqual({
      name: expect.stringMatching(/needs a name/),
      channelId: expect.stringMatching(/17 to 20 digits/),
    });
    expect(errors.summary).toHaveLength(3);
  });

  it('flags a repeated channel id on the later row', () => {
    const id = '12345678901234567';
    const errors = validateDiscordSettings(
      form({
        voiceChannels: [
          { key: 1, name: 'A', channelId: id },
          { key: 2, name: 'B', channelId: ` ${id} ` },
        ],
      }),
    );
    expect(errors.voiceChannels[1]).toBeUndefined();
    expect(errors.voiceChannels[2]?.channelId).toMatch(/repeats the channel ID of voice channel 1/);
  });

  it('trims values and turns empty ids into null', () => {
    expect(
      discordSettingsInput(
        form({
          announceChannelId: '  ',
          voiceChannels: [{ key: 1, name: ' Table ', channelId: ' 12345678901234567 ' }],
        }),
      ),
    ).toEqual({
      announceChannelId: null,
      roleId: null,
      voiceChannels: [{ name: 'Table', channelId: '12345678901234567' }],
    });
  });
});
