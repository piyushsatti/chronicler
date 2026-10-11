import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadGameCalendar, updateGameCalendar } from '../adapters/adminAdapter.js';

const KEY = ['adminGameCalendar'] as const;

const GREYHAWK_PRESET: Record<string, unknown> = {
  era: { name: 'Common Year', abbrev: 'CY' },
  days_per_week: 7,
  weekdays: [
    'Starday',
    'Sunday',
    'Moonday',
    'Godsday',
    'Waterday',
    'Earthday',
    'Freeday',
  ],
  periods: [
    { name: 'Needfest', type: 'festival', days: 7 },
    { name: 'Fireseek', type: 'month', days: 28 },
    { name: 'Readying', type: 'month', days: 28 },
    { name: 'Coldeven', type: 'month', days: 28 },
    { name: 'Growfest', type: 'festival', days: 7 },
    { name: 'Planting', type: 'month', days: 28 },
    { name: 'Flocktime', type: 'month', days: 28 },
    { name: 'Wealsun', type: 'month', days: 28 },
    { name: 'Richfest', type: 'festival', days: 7 },
    { name: 'Reaping', type: 'month', days: 28 },
    { name: 'Goodmonth', type: 'month', days: 28 },
    { name: 'Harvester', type: 'month', days: 28 },
    { name: 'Brewfest', type: 'festival', days: 7 },
    { name: 'Patchwall', type: 'month', days: 28 },
    { name: "Ready'reat", type: 'month', days: 28 },
    { name: 'Sunsebb', type: 'month', days: 28 },
  ],
  leap: null,
  rate_real_days_per_game_day: 1,
  moons: [
    { name: 'Luna', cycle_days: 28 },
    { name: 'Celene', cycle_days: 91 },
  ],
};

type FormState = {
  eraName: string;
  eraAbbrev: string;
  daysPerWeek: string;
  weekdays: string;
  rate: string;
};

function formFromDefinition(definition: Record<string, unknown>): FormState {
  const era = (definition.era ?? {}) as { name?: string; abbrev?: string };
  const weekdays = Array.isArray(definition.weekdays)
    ? (definition.weekdays as string[]).join(', ')
    : '';
  return {
    eraName: era.name ?? '',
    eraAbbrev: era.abbrev ?? '',
    daysPerWeek: String(definition.days_per_week ?? ''),
    weekdays,
    rate: String(definition.rate_real_days_per_game_day ?? '1'),
  };
}

export function useGameCalendarPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const calendar = useQuery({
    enabled: authority.allowed,
    queryKey: KEY,
    queryFn: loadGameCalendar,
  });
  const [form, setForm] = useState<FormState>(formFromDefinition({}));
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!calendar.data) return;
    setDefinition(calendar.data.definition);
    setForm(formFromDefinition(calendar.data.definition));
  }, [calendar.data]);

  const save = useMutation({
    mutationFn: authority.guardMutation(() => {
      const next = {
        ...definition,
        era: { name: form.eraName.trim(), abbrev: form.eraAbbrev.trim() },
        days_per_week: Number(form.daysPerWeek) || 0,
        weekdays: form.weekdays
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        rate_real_days_per_game_day: Number(form.rate) || 1,
      };
      return updateGameCalendar(next);
    }),
    onSuccess: async () => {
      setMessage('Game calendar saved.');
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  useAuthorityFailures(calendar.error, save.error);
  return {
    GREYHAWK_PRESET,
    formFromDefinition,
    calendar: panelState(calendar, 'admin:GameCalendarPanel'),
    form,
    setForm,
    definition,
    setDefinition,
    message,
    setMessage,
    save: panelState(save, 'admin:GameCalendarPanel'),
  };
}
