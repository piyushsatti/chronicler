import { civilDateInZone, weekdayColumn } from '../../utils/format.js';
import type { ChronicleListItemView } from './adapters/chronicleAdapter.js';

export type ChronicleRange = 'all' | 'week' | 'month';

export type ChronicleTimelineGroup = {
  date: string | null;
  entries: ChronicleListItemView[];
};

function addCivilDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sortChroniclesByPublicationDate(
  entries: readonly ChronicleListItemView[],
): ChronicleListItemView[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const parsedA = a.entry.publishedAt ? Date.parse(a.entry.publishedAt) : Number.NaN;
      const parsedB = b.entry.publishedAt ? Date.parse(b.entry.publishedAt) : Number.NaN;
      const aDate = Number.isFinite(parsedA) ? parsedA : Number.NEGATIVE_INFINITY;
      const bDate = Number.isFinite(parsedB) ? parsedB : Number.NEGATIVE_INFINITY;
      return bDate - aDate || a.index - b.index;
    })
    .map(({ entry }) => entry);
}

export function filterChroniclesByRange(
  entries: readonly ChronicleListItemView[],
  range: ChronicleRange,
  now: Date,
  timeZone: string | null,
): ChronicleListItemView[] {
  const sorted = sortChroniclesByPublicationDate(entries);
  if (range === 'all') return sorted;

  const today = civilDateInZone(now.toISOString(), timeZone);
  if (!today) return sorted;
  const start = range === 'week'
    ? addCivilDays(today, -weekdayColumn(today))
    : `${today.slice(0, 7)}-01`;
  const end = range === 'week'
    ? addCivilDays(start, 6)
    : addCivilDays(`${today.slice(0, 7)}-01`, daysInMonth(today) - 1);

  return sorted.filter((entry) => {
    const date = civilDateInZone(entry.publishedAt, timeZone);
    return date !== null && date >= start && date <= end;
  });
}

function daysInMonth(value: string): number {
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).getUTCDate();
}

export function groupChroniclesByPublicationDate(
  entries: readonly ChronicleListItemView[],
  timeZone: string | null,
): ChronicleTimelineGroup[] {
  const groups = new Map<string, ChronicleListItemView[]>();
  for (const entry of sortChroniclesByPublicationDate(entries)) {
    const date = civilDateInZone(entry.publishedAt, timeZone);
    const key = date ?? '';
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups].map(([date, grouped]) => ({ date: date || null, entries: grouped }));
}
