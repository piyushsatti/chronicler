import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadProfileDmDetails,
  PROFILE_DM_PAGE_SIZE,
} from '../adapters/profileDmAdapter.js';
import {
  DM_SCHEDULE_PAGE_SIZE,
  loadDmTableSchedule,
} from '../adapters/dmTableAdapter.js';
export function useProfileDmDetails(memberId: string) {
  const [page, setPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);
  const details = useQuery({
    queryKey: ['profileDmDetails', memberId, page],
    queryFn: () => loadProfileDmDetails(memberId, (page - 1) * PROFILE_DM_PAGE_SIZE),
  });
  const schedule = useQuery({
    queryKey: ['dm-table', 'schedule', memberId, schedulePage],
    queryFn: () => loadDmTableSchedule(memberId, (schedulePage - 1) * DM_SCHEDULE_PAGE_SIZE),
  });
  return {
    details,
    schedule,
    page,
    setPage,
    pageSize: PROFILE_DM_PAGE_SIZE,
    schedulePage,
    setSchedulePage,
    schedulePageSize: DM_SCHEDULE_PAGE_SIZE,
  };
}
