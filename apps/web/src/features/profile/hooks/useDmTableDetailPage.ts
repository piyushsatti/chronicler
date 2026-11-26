import { queryKeys } from '../../../api/queryKeys.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DM_SCHEDULE_PAGE_SIZE,
  loadDmTableBySlug,
  loadDmTableSchedule,
} from '../adapters/dmTableAdapter.js';
export function useDmTableDetailPage(slug: string) {
  const [page, setPage] = useState(1);
  const doc = useQuery({
    queryKey: queryKeys.dmTable(slug),
    queryFn: () => loadDmTableBySlug(slug),
    enabled: Boolean(slug),
  });
  const memberId = doc.data?.authorId ?? '';
  const schedule = useQuery({
    queryKey: queryKeys.dmTableSchedule(memberId, page),
    queryFn: () => loadDmTableSchedule(memberId, (page - 1) * DM_SCHEDULE_PAGE_SIZE),
    enabled: Boolean(memberId),
  });
  return { doc, schedule, page, setPage, pageSize: DM_SCHEDULE_PAGE_SIZE };
}
