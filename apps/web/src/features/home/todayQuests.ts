import { civilDateInZone } from '../../utils/format.js';
import type { HomeQuestView } from './adapters/homeLanesAdapter.js';

/**
 * Quests from the already-loaded upcoming window whose start falls on the
 * viewer's current civil day. The window itself starts at "now", so sessions
 * that began earlier today are not in it.
 */
export function questsHappeningToday(
  quests: readonly HomeQuestView[],
  timeZone: string | null,
  now: Date = new Date(),
): HomeQuestView[] {
  const today = civilDateInZone(now.toISOString(), timeZone);
  if (!today) return [];
  return quests.filter((quest) => civilDateInZone(quest.scheduledAt, timeZone) === today);
}
