import type { QuestBoardItemView } from './adapters/questAdapter.js';
import { civilDateInZone, nextCivilDay, weekdayColumn } from '../../utils/format.js';

export type BoardSegment = 'Open' | 'Live' | 'All';
export type QuestQuickFilter = 'All' | 'Today' | 'Tomorrow' | 'This week';
const OPEN_STATUSES = new Set(['open', 'filling', 'scheduled']);

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function matchesQuickFilter(
  scheduledAt: string,
  filter: QuestQuickFilter,
  referenceDate: Date,
  timeZone: string | null,
): boolean {
  if (filter === 'All') return true;
  const scheduled = civilDateInZone(scheduledAt, timeZone);
  const today = civilDateInZone(referenceDate.toISOString(), timeZone);
  if (!scheduled || !today) return false;
  const start =
    filter === 'Today'
      ? today
      : filter === 'Tomorrow'
        ? nextCivilDay(today)
        : addDays(today, -weekdayColumn(today));
  const end = filter === 'This week' ? addDays(start, 7) : nextCivilDay(start);
  return scheduled >= start && scheduled < end;
}

export function filterQuestBoardItems(
  items: QuestBoardItemView[],
  segment: BoardSegment,
  quickFilter: QuestQuickFilter,
  search: string,
  timeZone: string | null,
  referenceDate = new Date(),
): QuestBoardItemView[] {
  const needle = search.trim().toLocaleLowerCase();
  return items.filter((quest) => {
    if (
      segment === 'Open' &&
      !OPEN_STATUSES.has(quest.status.toLocaleLowerCase())
    )
      return false;
    if (segment === 'Live' && quest.status.toLocaleLowerCase() !== 'live') return false;
    if (!matchesQuickFilter(quest.scheduledAt, quickFilter, referenceDate, timeZone)) return false;
    return (
      !needle ||
      [quest.title, quest.shortCode, quest.hookText, quest.regionName, quest.dmName, quest.dmHandle]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(needle) ?? false)
    );
  }).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id.localeCompare(b.id));
}
