import { useAuth } from '../../../auth/AuthContext.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadProfileDmDetails } from '../adapters/profileDmAdapter.js';
import {
  DM_SCHEDULE_PAGE_SIZE,
  loadDmTableSchedule,
} from '../adapters/dmTableAdapter.js';
export function useProfileDmDetails(memberId: string, enabled: boolean) {
  const { token, sessionReady } = useAuth();
  const [schedulePage, setSchedulePage] = useState(1);
  const details = useQuery({
    queryKey: ['profileDmDetails', memberId],
    enabled: sessionReady && enabled,
    queryFn: ({ signal }) => loadProfileDmDetails(memberId, { signal, headers: { Authorization: token ? `Bearer ${token}` : '' } }),
  });
  const schedule = useQuery({
    queryKey: ['dm-table', 'schedule', memberId, schedulePage],
    enabled: sessionReady && enabled,
    queryFn: () =>
      loadDmTableSchedule(memberId, (schedulePage - 1) * DM_SCHEDULE_PAGE_SIZE),
  });
  return {
    details,
    schedule,
    schedulePage,
    setSchedulePage,
    schedulePageSize: DM_SCHEDULE_PAGE_SIZE,
  };
}
