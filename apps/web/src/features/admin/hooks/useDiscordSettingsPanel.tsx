import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadDiscordSettings, saveDiscordSettings } from '../adapters/adminAdapter.js';
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
  const queryClient = useQueryClient();
  const settingsQ = useQuery({
    enabled: authority.allowed,
    queryKey: [...KEY, authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadDiscordSettings, signal),
  });
  const nextKey = useRef(1);
  const [announceChannelId, setAnnounceChannelId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannelRow[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<DiscordSettingsErrors>(NO_ERRORS);
  const [summaryFocus, setSummaryFocus] = useState(0);

  useEffect(() => {
    if (!settingsQ.data) return;
    setAnnounceChannelId(settingsQ.data.announceChannelId ?? '');
    setRoleId(settingsQ.data.roleId ?? '');
    setVoiceChannels(
      settingsQ.data.voiceChannels.map((channel) => ({
        key: nextKey.current++,
        name: channel.name,
        channelId: channel.channelId,
      })),
    );
  }, [settingsQ.data]);

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
      setSaveMessage('Discord settings saved.');
      await queryClient.invalidateQueries({ queryKey: KEY });
      await queryClient.invalidateQueries({ queryKey: ['editor', 'voiceChannels'] });
    },
  });
  useAuthorityFailures(settingsQ.error, save.error);

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
    settingsQ: panelState(
      {
        ...settingsQ,
        retry: () => {
          void settingsQ.refetch();
        },
      },
      'admin:DiscordSettingsPanel',
    ),
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
    saveMessage,
    submit,
    save: panelState(save, 'admin:DiscordSettingsPanel'),
  };
}
