import {
  calendarPreset,
  calendarInput,
  type CalendarForm as FormState,
} from '../adapters/adminForms.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadGameCalendar, updateGameCalendar } from '../adapters/adminAdapter.js';

const KEY = ['adminGameCalendar'] as const;

export function useGameCalendarPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const calendar = useQuery({
    enabled: authority.allowed,
    queryKey: [...KEY, authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadGameCalendar, signal),
  });
  const [form, setForm] = useState<FormState>({
    eraName: '',
    eraAbbrev: '',
    daysPerWeek: '',
    weekdays: '',
    rate: '',
  });
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!calendar.data) return;
    setDefinition(calendar.data.definition);
    setForm(calendar.data.form);
  }, [calendar.data]);

  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useGameCalendarPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command) => {
      return updateGameCalendar(calendarInput(definition, form), command);
    }),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      setMessage('Game calendar saved.');
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  useAuthorityFailures(calendar.error, save.error);
  return {
    GREYHAWK_PRESET: calendarPreset.definition,
    presetForm: calendarPreset.form,
    calendar: panelState(
      {
        ...calendar,
        retry: () => {
          void calendar.refetch();
        },
      },
      'admin:GameCalendarPanel',
    ),
    form,
    setForm,
    definition,
    setDefinition,
    message,
    setMessage,
    save: panelState(save, 'admin:GameCalendarPanel'),
  };
}
