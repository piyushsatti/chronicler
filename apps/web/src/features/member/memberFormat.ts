const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function elapsed(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, now.getTime() - then);
}

/** "Member for" tile value: days, then months, then years since joining. */
export function formatMemberFor(joinedAt: string | null | undefined, now: Date = new Date()): string {
  const ms = elapsed(joinedAt, now);
  if (ms === null) return '—';
  const days = Math.floor(ms / DAY);
  if (days < 1) return 'Today';
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (days < 730) return `${Math.floor(days / 30.44)} mo`;
  return `${Math.floor(days / 365.25)} yr`;
}

/** "2 days ago" style label; null when the instant is missing or unparseable. */
export function formatRelativeDate(iso: string | null | undefined, now: Date = new Date()): string | null {
  const ms = elapsed(iso, now);
  if (ms === null) return null;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return rtf.format(-Math.floor(ms / MINUTE), 'minute');
  if (ms < DAY) return rtf.format(-Math.floor(ms / HOUR), 'hour');
  const days = Math.floor(ms / DAY);
  if (days < 14) return rtf.format(-days, 'day');
  if (days < 60) return rtf.format(-Math.floor(days / 7), 'week');
  if (days < 730) return rtf.format(-Math.floor(days / 30.44), 'month');
  return rtf.format(-Math.floor(days / 365.25), 'year');
}

/** Voice time as "3h 20m" / "45m". */
export function formatVoiceHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
