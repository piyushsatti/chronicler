import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  loadCalendar,
  loadCalendarQuests,
  loadRealDates,
} from '../adapters/calendarAdapter.js';
import { parseCalendarState } from '../calendarState.js';

export function useCalendarPage() {
  const [params, setParams] = useSearchParams();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const parsed = parseCalendarState(params, today);
  const state = parsed.success ? parsed.data : null;
  const calendar = useQuery({
    queryKey: ['calendar', state?.month, state?.day],
    queryFn: () => {
      if (!state) throw new Error('Invalid calendar location');
      return loadCalendar(state);
    },
    enabled: state !== null,
    retry: false,
  });
  const quests = useQuery({
    queryKey: ['calendarQuests', state],
    queryFn: () => {
      if (!state) throw new Error('Invalid calendar location');
      return loadCalendarQuests(state);
    },
    enabled: state !== null,
    retry: false,
  });
  const realDates = useQuery({
    queryKey: ['calendarRealDates', state?.gameDay, state?.realPage],
    queryFn: () => {
      if (!state || state.gameDay === undefined) throw new Error('Select a game day');
      return loadRealDates(state.gameDay, state.realPage);
    },
    enabled: state?.gameDay !== undefined,
    retry: false,
  });
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    if (!next.has('q') && next.has('search')) next.set('q', next.get('search') ?? '');
    if (!next.has('day') && next.has('date')) next.set('day', next.get('date') ?? '');
    next.delete('search');
    next.delete('date');
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };
  return {
    state,
    today,
    calendar,
    quests,
    realDates,
    update,
    reset: () => setParams({ month: today.slice(0, 7) }),
    retryCalendar: () => {
      void calendar.refetch();
    },
    retryQuests: () => {
      void quests.refetch();
    },
    retryRealDates: () => {
      void realDates.refetch();
    },
  };
}
