export type InstantStyle = 'date' | 'dateTime';
type Timestamp = string | null | undefined;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Placeholder dates far in the future (year >= 2099) mean "no date"; never display them. */
export function isSentinelDate(value: Timestamp): boolean {
  const year = Number((value ?? '').slice(0, 4));
  return Number.isInteger(year) && year >= 2099;
}
function parseInstant(value: Timestamp): Date | null {
  if (isSentinelDate(value)) return null;
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !/(Z|[+-]\d{2}:\d{2})$/i.test(value)
  )
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
const UTC_ZONES = new Set(['utc', 'etc/utc', 'etc/uct', 'uct', 'gmt', 'etc/gmt', 'zulu', 'etc/zulu']);
/** True when the viewer explicitly chose UTC (not when the device happens to be in it). */
function choseUtc(timeZone: string | null): boolean {
  return timeZone !== null && UTC_ZONES.has(timeZone.trim().toLowerCase());
}
function zonedParts(
  date: Date,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions,
): Partial<Record<Intl.DateTimeFormatPartTypes, string>> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
/**
 * Display instants in the viewer's zone (`timeZone`, else the device zone).
 * `date` reads "7 Mar 2026"; `dateTime` reads "Sat 7 Mar 2026, 23:30". No zone
 * name is shown, except " UTC" when the viewer chose UTC and the short zone
 * name inside the repeated autumn DST hour. Civil dates
 * ("2026-03-08") keep their calendar day in every zone. Absent or invalid
 * values read "—".
 */
export function formatInstant(
  value: Timestamp,
  timeZone: string | null = null,
  style: InstantStyle = 'dateTime',
): string {
  if (isSentinelDate(value)) return '—';
  if (value && CIVIL_DATE.test(value)) {
    const civil = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(civil.getTime())) return '—';
    const p = zonedParts(civil, 'UTC', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${p.day} ${p.month} ${p.year}`;
  }
  const date = parseInstant(value);
  if (!date) return '—';
  const p = zonedParts(date, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const day = `${p.day} ${p.month} ${p.year}`;
  if (style === 'date') return day;
  const zone = choseUtc(timeZone)
    ? ' UTC'
    : repeatedWallTime(date, timeZone)
      ? ` ${zonedParts(date, timeZone, { timeZoneName: 'short' }).timeZoneName ?? ''}`.trimEnd()
      : '';
  return `${p.weekday} ${day}, ${p.hour}:${p.minute}${zone}`;
}
/** The autumn DST hour happens twice; only then does a time need its zone name. */
function repeatedWallTime(date: Date, timeZone: string | null): boolean {
  const wall = (at: Date) => {
    const p = zonedParts(at, timeZone, {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return `${p.day} ${p.hour}:${p.minute}`;
  };
  const here = wall(date);
  // Rollbacks are usually an hour, but Lord Howe falls back 30 minutes and some zones
  // moved by 2 hours, so look for the same wall time at any offset up to 2 hours away.
  const minute = 60 * 1000;
  return REPEAT_PROBES_MIN.some(
    (m) =>
      wall(new Date(date.getTime() - m * minute)) === here ||
      wall(new Date(date.getTime() + m * minute)) === here,
  );
}
const REPEAT_PROBES_MIN = [15, 30, 45, 60, 75, 90, 105, 120] as const;
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

/** Nouns whose plural is the singular ("2 series"). */
const INVARIANT_PLURALS = new Set(['series']);

/** "1 result", "2 results", "2 series". Pass `plural` for other irregular nouns. */
export function pluralize(
  count: number,
  singular: string,
  plural = INVARIANT_PLURALS.has(singular.toLowerCase()) ? singular : `${singular}s`,
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

const SNOWFLAKE = /^\d{15,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * True for machine identifiers that must never be shown as a name or label:
 * Discord snowflakes ("100000000000000001"), UUIDs and kebab slugs
 * ("qa-the-salt-stair").
 */
export function isMachineId(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim().replace(/^@/, '');
  return SNOWFLAKE.test(raw) || UUID.test(raw) || KEBAB_SLUG.test(raw);
}

/** "@sable" for a readable handle; null for an empty or numeric (snowflake) one. */
export function handleLabel(handle: string | null | undefined): string | null {
  const raw = (handle ?? '').trim().replace(/^@/, '');
  if (!raw || SNOWFLAKE.test(raw) || UUID.test(raw)) return null;
  return `@${raw}`;
}

export type PersonLike = {
  id?: string;
  memberId?: string;
  displayName?: string | null;
  handle?: string | null;
};

/** A member's display label; use personLabels for a visible group of people. */
export function personName(
  person: PersonLike | null | undefined,
  fallback = 'Unnamed member',
): string {
  return personLabels([person], fallback)[0];
}

const GENERIC_NAMES = new Set(['member', 'user', 'player', 'unknown', 'unnamed', 'unnamed member', 'anonymous', 'dev']);

/**
 * Names for a visible set of people, distinguishable from each other: a name
 * that is empty, generic ("Member", "dev") or shared with another person in
 * the list reads "Name (@handle)". Returns labels in input order. Never
 * includes a snowflake.
 */
export function personLabels(
  people: readonly (PersonLike | null | undefined)[],
  fallback = 'Unnamed member',
): string[] {
  const names = people.map((person) => {
    const display = (person?.displayName ?? '').trim().replace(/^qa[-_]\S+\s+retained$/i, 'Member');
    const displayHandle = display.startsWith('@') ? display.slice(1).toLowerCase() : '';
    const handle = (person?.handle ?? '').trim().replace(/^@/, '').toLowerCase();
    const isHandleDisplay = displayHandle !== '' && handle !== '' && displayHandle === handle;
    return display && !isHandleDisplay && !SNOWFLAKE.test(display) && !UUID.test(display)
      ? display
      : fallback;
  });
  const membersByName = new Map<string, Set<unknown>>();
  names.forEach((name, index) => {
    const key = name.toLowerCase();
    const person = people[index];
    const identity = person?.id ?? person?.memberId ?? handleLabel(person?.handle)?.toLowerCase() ?? person;
    const members = membersByName.get(key) ?? new Set();
    members.add(identity);
    membersByName.set(key, members);
  });
  return people.map((person, index) => {
    const name = names[index];
    const handle = handleLabel(person?.handle);
    const needsHandle =
      name === fallback ||
      GENERIC_NAMES.has(name.toLowerCase()) ||
      (membersByName.get(name.toLowerCase())?.size ?? 0) > 1;
    if (!handle || !needsHandle) return name;
    return `${name} (${handle})`;
  });
}

/** Labels for a visible list of members (D-names): display name, or "Name (@handle)"
 * when the name is generic or shared. Look a member up by the same object. */
export function memberLabeler<T extends PersonLike>(
  members: readonly T[],
): (member: T) => string {
  const labels = personLabels(members);
  const byMember = new Map<T, string>(
    members.map((member, index) => [member, labels[index] ?? '']),
  );
  return (member) => byMember.get(member) ?? personName(member);
}
