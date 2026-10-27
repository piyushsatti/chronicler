/** Form state and checks for the Discord settings panel. */

export type VoiceChannelRow = { key: number; name: string; channelId: string };

export type DiscordSettingsForm = {
  announceChannelId: string;
  roleId: string;
  voiceChannels: VoiceChannelRow[];
};

export type DiscordSettingsErrors = {
  announceChannelId?: string;
  roleId?: string;
  /** Keyed by the row's `key`. */
  voiceChannels: Record<number, { name?: string; channelId?: string }>;
  /** Every message, in page order, for the error summary. */
  summary: string[];
};

const SNOWFLAKE = /^[0-9]{17,20}$/;
const ID_RULE = 'must be a Discord ID: 17 to 20 digits';
const MAX_CHANNELS = 100;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE.test(value.trim());
}

export function validateDiscordSettings(form: DiscordSettingsForm): DiscordSettingsErrors {
  const errors: DiscordSettingsErrors = { voiceChannels: {}, summary: [] };
  const announce = form.announceChannelId.trim();
  if (announce !== '' && !SNOWFLAKE.test(announce)) {
    errors.announceChannelId = `Announce channel ID ${ID_RULE}.`;
    errors.summary.push(errors.announceChannelId);
  }
  const role = form.roleId.trim();
  if (role !== '' && !SNOWFLAKE.test(role)) {
    errors.roleId = `Quest role ID ${ID_RULE}.`;
    errors.summary.push(errors.roleId);
  }
  const seen = new Map<string, number>();
  form.voiceChannels.forEach((row, index) => {
    const label = `Voice channel ${index + 1}`;
    const issue: { name?: string; channelId?: string } = {};
    const id = row.channelId.trim();
    if (row.name.trim() === '') {
      issue.name = `${label} needs a name, so DMs can tell it apart.`;
    }
    if (!SNOWFLAKE.test(id)) {
      issue.channelId = `${label} channel ID ${ID_RULE}.`;
    } else if (seen.has(id)) {
      issue.channelId = `${label} repeats the channel ID of voice channel ${(seen.get(id) ?? 0) + 1}. List each channel once.`;
    } else {
      seen.set(id, index);
    }
    if (issue.name || issue.channelId) {
      errors.voiceChannels[row.key] = issue;
      if (issue.name) errors.summary.push(issue.name);
      if (issue.channelId) errors.summary.push(issue.channelId);
    }
  });
  if (form.voiceChannels.length > MAX_CHANNELS) {
    errors.summary.push(`List at most ${MAX_CHANNELS} voice channels.`);
  }
  return errors;
}

export function discordSettingsInput(form: DiscordSettingsForm) {
  return {
    announceChannelId: form.announceChannelId.trim() || null,
    roleId: form.roleId.trim() || null,
    voiceChannels: form.voiceChannels.map((row) => ({
      name: row.name.trim(),
      channelId: row.channelId.trim(),
    })),
  };
}
