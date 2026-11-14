import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadDiscordSettings,
  saveDiscordSettings,
  type DiscordSettingsView,
} from '../adapters/adminAdapter.js';
import {
  discordSettingsInput,
  validateDiscordSettings,
  type DiscordSettingsErrors,
  type VoiceChannelRow,
} from '../adapters/discordSettingsForm.js';

const KEY = ['adminDiscordSettings'] as const;
const NO_ERRORS: DiscordSettingsErrors = { voiceChannels: {}, summary: [] };

export function useDiscordSettingsPanel() {
  const authority = useAdminAuthority();
  const settingsQ = useQuery({
    enabled: authority.allowed,
    queryKey: [...KEY, authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadDiscordSettings, signal),
  });
  useAuthorityFailures(settingsQ.error);
  return {
    settingsQ: panelState(
      {
        ...settingsQ,
        retry: () => {
          void settingsQ.refetch();
        },
      },
      'admin:DiscordSettingsPanel',
    ),
  };
}

function voiceRowsFrom(
  channels: DiscordSettingsView['voiceChannels'],
  nextKey: { current: number },
): VoiceChannelRow[] {
  return channels.map((channel) => ({
    key: nextKey.current++,
    name: channel.name,
    channelId: channel.channelId,
  }));
}

export function useDiscordSettingsForm(
  initial: DiscordSettingsView,
  setSaveMessage: (message: string | null) => void,
) {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const nextKey = useRef(1);
  const [announceChannelId, setAnnounceChannelId] = useState(
    initial.announceChannelId ?? '',
  );
  const [roleId, setRoleId] = useState(initial.roleId ?? '');
  const [voiceChannels, setVoiceChannels] = useState(() =>
    voiceRowsFrom(initial.voiceChannels, nextKey),
  );
  const [errors, setErrors] = useState<DiscordSettingsErrors>(NO_ERRORS);
  const [summaryFocus, setSummaryFocus] = useState(0);

  const form = { announceChannelId, roleId, voiceChannels };
  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useDiscordSettingsPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command) =>
      saveDiscordSettings(discordSettingsInput(form), command),
    ),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      await queryClient.invalidateQueries({ queryKey: KEY });
      await queryClient.invalidateQueries({ queryKey: ['editor', 'voiceChannels'] });
      setSaveMessage('Discord settings saved.');
    },
  });
  useAuthorityFailures(save.error);

  const submit = (): void => {
    setSaveMessage(null);
    const found = validateDiscordSettings(form);
    setErrors(found);
    if (found.summary.length > 0) {
      setSummaryFocus((n) => n + 1);
      return;
    }
    save.mutate();
  };

  return {
    announceChannelId,
    setAnnounceChannelId,
    roleId,
    setRoleId,
    voiceChannels,
    addVoiceChannel: () =>
      setVoiceChannels((rows) => [
        ...rows,
        { key: nextKey.current++, name: '', channelId: '' },
      ]),
    updateVoiceChannel: (key: number, patch: Partial<Omit<VoiceChannelRow, 'key'>>) =>
      setVoiceChannels((rows) =>
        rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      ),
    removeVoiceChannel: (key: number) =>
      setVoiceChannels((rows) => rows.filter((row) => row.key !== key)),
    errors,
    summaryFocus,
    submit,
    save: panelState(save, 'admin:DiscordSettingsPanel'),
  };
}
