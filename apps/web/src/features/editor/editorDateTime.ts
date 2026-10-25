import { Temporal } from '@js-temporal/polyfill';

export type SessionTimeCandidate = { instant: string; offset: string };
export type SessionTimeResolution =
  | { status: 'invalid' | 'gap' }
  | { status: 'unique'; candidate: SessionTimeCandidate }
  | { status: 'ambiguous'; candidates: [SessionTimeCandidate, SessionTimeCandidate] };

/** Accept transport instants without normalizing away their original precision. */
export function isEditorInstant(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return false;
  try {
    return Temporal.Instant.from(value).epochNanoseconds % 1000n === 0n;
  } catch {
    return false;
  }
}

export function editorTimeZone(saved: string | null): string {
  return saved ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A new quest's default session start: the first whole hour in the viewer's time
 * zone that is at least 24 hours after `now`.
 */
export function defaultSessionStart(now: Date, timeZone: string): string {
  const earliest = Temporal.Instant.fromEpochMilliseconds(now.getTime()).add({
    hours: 24,
  });
  let zoned: Temporal.ZonedDateTime;
  try {
    zoned = earliest.toZonedDateTimeISO(timeZone);
  } catch {
    zoned = earliest.toZonedDateTimeISO('UTC');
  }
  return zoned
    .round({ smallestUnit: 'hour', roundingMode: 'ceil' })
    .toInstant()
    .toString();
}

/** The native picker receives civil minutes, never a device-converted ISO value. */
export function sessionLocalValue(value: string, timeZone: string): string {
  return isEditorInstant(value)
    ? Temporal.Instant.from(value)
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'minute' })
    : value;
}

function candidate(zoned: Temporal.ZonedDateTime): SessionTimeCandidate {
  return { instant: zoned.toInstant().toString(), offset: zoned.offset };
}

/** Resolve a civil edit explicitly; gaps and overlaps never use compatible rollover. */
export function resolveSessionTime(
  value: string,
  timeZone: string,
): SessionTimeResolution {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { status: 'invalid' };
  try {
    const civil = Temporal.PlainDateTime.from(value, { overflow: 'reject' });
    try {
      const exact = civil.toZonedDateTime(timeZone, { disambiguation: 'reject' });
      return civil.equals(exact.toPlainDateTime())
        ? { status: 'unique', candidate: candidate(exact) }
        : { status: 'gap' };
    } catch {
      const earlier = civil.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
      const later = civil.toZonedDateTime(timeZone, { disambiguation: 'later' });
      if (
        !civil.equals(earlier.toPlainDateTime()) ||
        !civil.equals(later.toPlainDateTime())
      ) {
        return { status: 'gap' };
      }
      return {
        status: 'ambiguous',
        candidates: [candidate(earlier), candidate(later)],
      };
    }
  } catch {
    return { status: 'invalid' };
  }
}
