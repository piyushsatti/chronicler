/** Format an ISO datetime for quest schedule chips. Returns TBA when absent. */
export function formatScheduled(isoString: string | null | undefined): string {
  if (!isoString) return 'TBA';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'TBA';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
