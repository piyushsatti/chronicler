import { queryKeys } from '../../../api/queryKeys.js';
import {
  calendarEraIssues,
  calendarPeriodIssues,
  calendarWritesPeriods,
  newCalendarPeriodDraft,
  hasCalendarPeriodIssues,
  calendarPreset,
  calendarInput,
  type CalendarForm as FormState,
} from '../adapters/adminForms.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadGameCalendar,
  updateGameCalendar,
  type GameCalendarView,
} from '../adapters/adminAdapter.js';
import { safeAppError } from '../../../errors/toAppError.js';
import { TransportError } from '../../../errors/types.js';


function isRejectedDefinition(err: unknown): boolean {
  const cause = err && typeof err === 'object' && 'cause' in err ? err.cause : err;
  return cause instanceof TransportError && cause.code === 'INVALID';
}

export function useGameCalendarPanel() {
  const authority = useAdminAuthority();
  const calendar = useQuery({
    enabled: authority.allowed,
    queryKey: queryKeys.adminGameCalendar(authority.cacheKey),
    queryFn: ({ signal }) => authority.read(loadGameCalendar, signal),
  });
  useAuthorityFailures(calendar.error);
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
  };
}

export function useGameCalendarForm(
  initial: GameCalendarView,
  setMessage: (message: string | null) => void,
) {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initial.form);
  const [definition, setDefinition] = useState<Record<string, unknown>>(
    initial.definition,
  );

  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useGameCalendarPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(async (command) => {
      try {
        return await updateGameCalendar(calendarInput(definition, form), command);
      } catch (err) {
        // The API is the authority on the definition: say it refused, rather than "try again".
        if (isRejectedDefinition(err))
          throw safeAppError(
            'The server rejected this calendar. Check the era name, abbreviation and periods, then save again.',
            'admin:calendar:update',
            err,
          );
        throw err;
      }
    }),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminGameCalendar() });
      setMessage('Game calendar saved.');
    },
  });
  useAuthorityFailures(save.error);
  const periodIssues = calendarPeriodIssues(form.periods);
  const eraIssues = calendarEraIssues(form, calendarWritesPeriods(definition, form));
  return {
    form,
    setForm,
    periodIssues,
    eraIssues,
    newPeriod: newCalendarPeriodDraft,
    periodsBlocked:
      hasCalendarPeriodIssues(periodIssues) || Boolean(eraIssues.name || eraIssues.abbrev),
    definition,
    setDefinition,
    setMessage,
    save: panelState(save, 'admin:GameCalendarPanel'),
  };
}
