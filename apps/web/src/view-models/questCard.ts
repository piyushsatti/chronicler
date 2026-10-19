/** Stable quest status for UI cards — decoupled from GraphQL wire strings. */
export type QuestCardStatus =
  | 'open'
  | 'filling'
  | 'full'
  | 'scheduled'
  | 'live'
  | 'closed'
  | 'cancelled';

const DISPLAY_STATUS_FALLBACK: Record<string, QuestCardStatus> = {
  open: 'open',
  filling: 'filling',
  full: 'full',
  scheduled: 'scheduled',
  live: 'live',
  played: 'closed',
  closed: 'closed',
  cancelled: 'cancelled',
};

export function toCardStatus(
  displayStatus: string | null,
  status: string,
): QuestCardStatus {
  const key = (displayStatus ?? status).toLowerCase();
  return DISPLAY_STATUS_FALLBACK[key] ?? 'open';
}
