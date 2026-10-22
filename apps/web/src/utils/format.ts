export type InstantStyle = 'date' | 'dateTime';
type Timestamp = string | null | undefined;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseInstant(value: Timestamp): Date | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !/(Z|[+-]\d{2}:\d{2})$/i.test(value)
  )
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
/** Display instants in the selected zone; civil dates keep their calendar day in every zone. */
export function formatInstant(
  value: Timestamp,
  timeZone: string | null = null,
  style: InstantStyle = 'dateTime',
): string {
  if (value && CIVIL_DATE.test(value)) {
    const civil = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(civil.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(civil);
  }
  const date = parseInstant(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(style === 'dateTime'
      ? ({
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        } as const)
      : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
/** Existing schedule chips retain their device-zone default and absent-value label. */
export function formatScheduled(
  value: Timestamp,
  timeZone: string | null = null,
): string {
  const formatted = formatInstant(value, timeZone);
  return formatted === '—' ? 'TBA' : formatted;
}
export function civilDateInZone(
  value: Timestamp,
  timeZone: string | null = null,
): string | null {
  if (value && CIVIL_DATE.test(value)) return value;
  const date = parseInstant(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Compact grid-cell label: "2026-10-22" reads "Thu 22"; anything else is returned as given. */
export function dayLabel(value: string): string {
  if (!CIVIL_DATE.test(value)) return value;
  const civil = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(civil.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(civil);
}
function civilParts(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
/** "2026-10" or "2026-10-15" reads "October 2026"; anything else is returned as given. */
export function monthLabel(value: string): string {
  const civil = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  if (!CIVIL_DATE.test(civil) || Number.isNaN(Date.parse(`${civil}T00:00:00Z`)))
    return value;
  return civilParts(civil, { month: 'long', year: 'numeric' });
}
/** "2026-10-15" reads "Thursday 15 October 2026", assembled so engines that add a comma agree. */
export function longDateLabel(value: string): string {
  if (!CIVIL_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    return value;
  const part = (options: Intl.DateTimeFormatOptions) => civilParts(value, options);
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}`;
}
/** Monday-first column (0 Monday … 6 Sunday) of a civil date, the same in every zone. */
export function weekdayColumn(value: string): number {
  return (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;
}
/** Advance a validated civil date without adding elapsed time across a DST boundary. */
export function nextCivilDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** "1 result", "2 results". Pass `plural` for irregular nouns. */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? singular : plural}`;
}

/**
 * Sentence-case a machine key: `pending_approval` and `PENDING-APPROVAL` read
 * "Pending approval". Values that already read as words ("Feature", "NPC") are kept.
 */
export function humanizeKey(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  const machine =
    /[_-]/.test(raw) ||
    raw === raw.toLowerCase() ||
    (raw === raw.toUpperCase() && raw.length > 3);
  if (!machine) return raw;
  const words = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!words) return '';
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Look a key up in a label table (case-insensitive); unknown keys are humanized. */
export function labelFor(
  value: string | null | undefined,
  table: Readonly<Record<string, string>> = {},
): string {
  const key = (value ?? '').trim().toLowerCase();
  return table[key] ?? humanizeKey(value);
}

/** Shared reader-facing labels for status keys used by quests, documents and reviews. */
export const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: 'Draft',
  open: 'Open',
  full: 'Full',
  played: 'Played',
  closed: 'Closed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  published: 'Published',
  archived: 'Archived',
  retired: 'Retired',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Changes requested',
  signed_up: 'Signed up',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  no_show: 'No-show',
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  banned: 'Banned',
  left: 'Left the server',
};

export function statusLabel(value: string | null | undefined): string {
  return labelFor(value, STATUS_LABELS);
}

/** Member roles as people say them. */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  dm: 'DM',
  admin: 'Admin',
  player: 'Player',
  verifier: 'Verifier',
  archon: 'Archon',
  lieutenant: 'Lieutenant',
};

export function roleLabel(value: string | null | undefined): string {
  return labelFor(value, ROLE_LABELS);
}

/** Character statuses read the way the roster filter names them. */
export const CHARACTER_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: 'Approved',
  pending_approval: 'Awaiting approval',
  retired: 'Retired',
  dead: 'Dead',
};

export function characterStatusLabel(value: string | null | undefined): string {
  return labelFor(value, CHARACTER_STATUS_LABELS);
}

const VERIFICATION_LABELS: Readonly<Record<string, string>> = {
  pending: 'Awaiting verification',
  rejected: 'Changes requested',
  approved: 'Verified',
};

/** Character verification; anything outside the review states (UNKNOWN, draft, missing) reads as not submitted. */
export function verificationLabel(value: string | null | undefined): string {
  return VERIFICATION_LABELS[(value ?? '').trim().toLowerCase()] ?? 'Not submitted';
}

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** "THURSDAY", "thu" and "Thursday" all read "Thursday" ("Thursdays" with `plural`). */
export function weekdayLabel(
  value: string | null | undefined,
  options: { plural?: boolean } = {},
): string {
  const key = (value ?? '').trim().toLowerCase();
  const day =
    key.length >= 3
      ? WEEKDAYS.find((name) => name.toLowerCase().startsWith(key.slice(0, 3)))
      : undefined;
  if (!day) return humanizeKey(value);
  return options.plural ? `${day}s` : day;
}

/** Weekday keys in calendar order, joined for reading: "Monday, Thursday and Sunday". */
export function weekdayList(
  values: readonly string[],
  options: { plural?: boolean } = {},
): string {
  const order = (value: string) => {
    const label = weekdayLabel(value);
    const index = WEEKDAYS.indexOf(label as (typeof WEEKDAYS)[number]);
    return index === -1 ? WEEKDAYS.length : index;
  };
  const labels = [...new Set(values)]
    .sort((a, b) => order(a) - order(b))
    .map((value) => weekdayLabel(value, options));
  return listLabel(labels);
}

/** "a", "a and b", "a, b and c". */
export function listLabel(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "18:00" from "18:00:00"; anything unparseable is returned trimmed. */
export function clockLabel(value: string | null | undefined): string {
  const match = (value ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : (value ?? '').trim();
}
